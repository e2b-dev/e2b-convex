import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import packageMetadata from "@e2b/convex/package.json" with { type: "json" };
import { FilesystemService, ProcessService } from "./protocol.js";
import {
  AuthenticationError,
  CommandExitError,
  FileNotFoundError,
  RateLimitError,
  SandboxError,
  SandboxNotFoundError,
  TimeoutError,
  mapConnectError,
} from "./errors.js";
import type {
  CommandResult,
  EntryInfo,
  SandboxConnectionOptions,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxWire,
} from "./types.js";

const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_TEMPLATE = "base";
const ENVD_PORT = 49_983;
const INTEGRATION_TAG = `${packageMetadata.name
  .replace(/^@/, "")
  .replace("/", "-")}/${packageMetadata.version}`;

interface ClientConfig {
  apiKey: string;
  domain?: string;
}

interface RpcEvent {
  event?: {
    event?:
      | { case: "start"; value: { pid: number } }
      | {
          case: "data";
          value: {
            output:
              | { case: "stdout"; value: Uint8Array }
              | { case: "stderr"; value: Uint8Array }
              | { case: "pty"; value: Uint8Array }
              | { case: undefined; value?: undefined };
          };
        }
      | {
          case: "end";
          value: { exitCode: number; error?: string };
        }
      | { case: "keepalive"; value: object }
      | { case: undefined; value?: undefined };
  };
}

interface ProcessRpc {
  start(
    request: {
      process: {
        cmd: string;
        args: string[];
        cwd?: string;
        envs?: Record<string, string>;
      };
      stdin: boolean;
    },
    options: {
      headers: HeadersInit;
      signal: AbortSignal;
      timeoutMs: number;
    },
  ): AsyncIterable<RpcEvent>;
}

interface FileEntryWire {
  name: string;
  path: string;
  type: number;
  size: bigint;
  mode: number;
  permissions: string;
  owner: string;
  group: string;
  modifiedTime?: { seconds: bigint; nanos: number };
  symlinkTarget?: string;
}

interface FilesystemRpc {
  stat(
    request: { path: string },
    options: { signal: AbortSignal },
  ): Promise<{ entry?: FileEntryWire }>;
  listDir(
    request: { path: string; depth: number },
    options: { signal: AbortSignal },
  ): Promise<{ entries: FileEntryWire[] }>;
}

function timeoutSignal(timeoutMs = REQUEST_TIMEOUT_MS) {
  return AbortSignal.timeout(timeoutMs);
}

function timeoutSeconds(timeoutMs: number) {
  return Math.ceil(timeoutMs / 1_000);
}

function versionBefore(version: string, minimum: string) {
  const left = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = minimum
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

async function responseMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText;
  try {
    const value = JSON.parse(text) as { message?: string };
    return value.message ?? text;
  } catch {
    return text;
  }
}

async function assertResponse(response: Response, notFoundMessage?: string) {
  if (response.ok) return;
  const message = await responseMessage(response);
  if (response.status === 401) throw new AuthenticationError(message);
  if (response.status === 404 && notFoundMessage)
    throw new SandboxNotFoundError(notFoundMessage);
  if (response.status === 429) throw new RateLimitError(message);
  if (response.status === 502) throw new TimeoutError(message);
  throw new SandboxError(`${response.status}: ${message}`);
}

function withIdleTimeout(
  source: ReadableStream<Uint8Array>,
  timeoutMs: number,
) {
  const reader = source.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      timer = setTimeout(() => {
        void reader.cancel("E2B file stream timed out");
        controller.error(new TimeoutError("E2B file stream timed out"));
      }, timeoutMs);
      try {
        const { done, value } = await reader.read();
        clear();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        clear();
        controller.error(error);
      }
    },
    async cancel(reason) {
      clear();
      await reader.cancel(reason);
    },
  });
}

function mapSandbox(wire: SandboxWire): SandboxInfo {
  return {
    sandboxId: wire.sandboxID,
    templateId: wire.templateID,
    metadata: wire.metadata ?? {},
    startedAt: new Date(wire.startedAt),
    endAt: new Date(wire.endAt),
    state: wire.state,
    envdVersion: wire.envdVersion,
    sandboxDomain: wire.domain || undefined,
  };
}

function mapEntry(entry: FileEntryWire): EntryInfo {
  const type =
    entry.type === 1
      ? "file"
      : entry.type === 2
        ? "dir"
        : entry.type === 3
          ? "symlink"
          : undefined;
  return {
    name: entry.name,
    path: entry.path,
    ...(type ? { type } : {}),
    size: Number(entry.size),
    mode: entry.mode,
    permissions: entry.permissions,
    owner: entry.owner,
    group: entry.group,
    ...(entry.modifiedTime
      ? {
          modifiedTime: new Date(
            Number(entry.modifiedTime.seconds) * 1_000 +
              Math.floor(entry.modifiedTime.nanos / 1_000_000),
          ),
        }
      : {}),
    ...(entry.symlinkTarget ? { symlinkTarget: entry.symlinkTarget } : {}),
  };
}

class FilesystemClient {
  private readonly rpc: FilesystemRpc;

  constructor(
    private readonly envdUrl: string,
    private readonly headers: Record<string, string>,
    transport: ReturnType<typeof createConnectTransport>,
    private readonly defaultUsername?: string,
  ) {
    this.rpc = createClient(
      FilesystemService,
      transport,
    ) as unknown as FilesystemRpc;
  }

  async read(
    path: string,
    options: { format: "stream" },
  ): Promise<ReadableStream<Uint8Array>>;
  async read(
    path: string,
    _options: { format: "stream" },
  ): Promise<ReadableStream<Uint8Array>> {
    void _options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      const url = new URL("/files", this.envdUrl);
      url.searchParams.set("path", path);
      if (this.defaultUsername)
        url.searchParams.set("username", this.defaultUsername);
      response = await fetch(url, {
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (error) {
      clearTimeout(timer);
      throw mapConnectError(error, true);
    }
    if (!response.ok) {
      const message = await responseMessage(response);
      if (response.status === 404) throw new FileNotFoundError(message);
      await assertResponse(response);
    }
    if (!response.body) return new Blob([]).stream();
    return withIdleTimeout(response.body, REQUEST_TIMEOUT_MS);
  }

  async write(path: string, content: string): Promise<void> {
    const form = new FormData();
    form.append("file", new Blob([content]), path);
    const url = new URL("/files", this.envdUrl);
    url.searchParams.set("path", path);
    if (this.defaultUsername)
      url.searchParams.set("username", this.defaultUsername);
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: form,
      signal: timeoutSignal(),
    });
    if (!response.ok) {
      const message = await responseMessage(response);
      if (response.status === 404) throw new FileNotFoundError(message);
      await assertResponse(response);
    }
  }

  async getInfo(path: string): Promise<EntryInfo> {
    try {
      const response = await this.rpc.stat(
        { path },
        { signal: timeoutSignal() },
      );
      if (!response.entry) throw new SandboxError("Missing file information");
      return mapEntry(response.entry);
    } catch (error) {
      throw mapConnectError(error, true);
    }
  }

  async list(path: string, options?: { depth?: number }): Promise<EntryInfo[]> {
    try {
      const response = await this.rpc.listDir(
        { path, depth: options?.depth ?? 1 },
        { signal: timeoutSignal() },
      );
      return response.entries.map(mapEntry).filter((entry) => entry.type);
    } catch (error) {
      throw mapConnectError(error, true);
    }
  }
}

class CommandsClient {
  private readonly rpc: ProcessRpc;

  constructor(transport: ReturnType<typeof createConnectTransport>) {
    this.rpc = createClient(ProcessService, transport) as unknown as ProcessRpc;
  }

  async run(
    command: string,
    options?: {
      timeoutMs?: number;
      cwd?: string;
      envs?: Record<string, string>;
    },
  ): Promise<CommandResult> {
    const controller = new AbortController();
    const handshakeTimer = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();
    let stdout = "";
    let stderr = "";
    let completed = false;
    try {
      const events = this.rpc.start(
        {
          process: {
            cmd: "/bin/bash",
            args: ["-l", "-c", command],
            ...(options?.cwd ? { cwd: options.cwd } : {}),
            ...(options?.envs ? { envs: options.envs } : {}),
          },
          stdin: false,
        },
        {
          headers: { "Keepalive-Ping-Interval": "50" },
          signal: controller.signal,
          timeoutMs: options?.timeoutMs ?? REQUEST_TIMEOUT_MS,
        },
      );
      for await (const response of events) {
        const event = response.event?.event;
        if (event?.case === "start") {
          clearTimeout(handshakeTimer);
        } else if (event?.case === "data") {
          if (event.value.output.case === "stdout")
            stdout += stdoutDecoder.decode(event.value.output.value, {
              stream: true,
            });
          if (event.value.output.case === "stderr")
            stderr += stderrDecoder.decode(event.value.output.value, {
              stream: true,
            });
        } else if (event?.case === "end") {
          stdout += stdoutDecoder.decode();
          stderr += stderrDecoder.decode();
          const result = {
            exitCode: event.value.exitCode,
            stdout,
            stderr,
            ...(event.value.error ? { error: event.value.error } : {}),
          };
          completed = true;
          if (result.exitCode !== 0)
            throw new CommandExitError(
              result.exitCode,
              stdout,
              stderr,
              result.error,
            );
          return result;
        }
      }
      throw new SandboxError("Process exited without a result");
    } catch (error) {
      if (error instanceof CommandExitError) throw error;
      throw mapConnectError(error);
    } finally {
      clearTimeout(handshakeTimer);
      if (!completed) controller.abort();
    }
  }
}

export class SandboxClient {
  readonly commands: CommandsClient;
  readonly files: FilesystemClient;
  private readonly envdUrl: string;

  constructor(
    readonly sandboxId: string,
    private readonly api: SandboxApi,
    private readonly config: {
      domain: string;
      sandboxDomain: string;
      envdVersion: string;
      envdAccessToken?: string;
    },
  ) {
    this.envdUrl = `https://${ENVD_PORT}-${sandboxId}.${config.sandboxDomain}`;
    const headers: Record<string, string> = {
      "User-Agent": INTEGRATION_TAG,
      "E2b-Sandbox-Id": sandboxId,
      "E2b-Sandbox-Port": String(ENVD_PORT),
      ...(config.envdAccessToken
        ? { "X-Access-Token": config.envdAccessToken }
        : {}),
    };
    const legacyUsername = versionBefore(config.envdVersion, "0.4.0")
      ? "user"
      : undefined;
    const transport = createConnectTransport({
      baseUrl: this.envdUrl,
      useBinaryFormat: false,
      fetch: (input, init) => {
        const merged = new Headers(init?.headers);
        for (const [key, value] of Object.entries(headers))
          merged.set(key, value);
        if (legacyUsername) merged.set("Authorization", "Basic dXNlcjo=");
        return fetch(input, { ...init, headers: merged, redirect: "follow" });
      },
    });
    this.commands = new CommandsClient(transport);
    this.files = new FilesystemClient(
      this.envdUrl,
      headers,
      transport,
      legacyUsername,
    );
  }

  getHost(port: number) {
    return `${port}-${this.sandboxId}.${this.config.sandboxDomain}`;
  }

  getInfo() {
    return this.api.getInfo(this.sandboxId);
  }

  pause() {
    return this.api.pause(this.sandboxId);
  }

  kill() {
    return this.api.kill(this.sandboxId);
  }
}

class SandboxPaginator {
  hasNext = true;
  private nextToken?: string;

  constructor(
    private readonly api: SandboxApi,
    private readonly options: {
      query?: { metadata?: Record<string, string> };
      order?: "asc" | "desc";
      limit?: number;
    },
  ) {}

  async nextItems() {
    if (!this.hasNext) throw new Error("No more items to fetch");
    const result = await this.api.listPage({
      ...this.options,
      nextToken: this.nextToken,
    });
    this.nextToken = result.nextToken;
    this.hasNext = Boolean(this.nextToken);
    return result.items;
  }
}

class SandboxApi {
  private readonly domain: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ClientConfig) {
    if (!config.apiKey)
      throw new AuthenticationError("E2B API key is required");
    this.domain = config.domain ?? "e2b.app";
    this.baseUrl = `https://api.${this.domain}`;
  }

  private async request(path: string, init?: RequestInit) {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "User-Agent": INTEGRATION_TAG,
        "X-API-KEY": this.config.apiKey,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...Object.fromEntries(new Headers(init?.headers)),
      },
      signal: init?.signal ?? timeoutSignal(),
    });
  }

  private instance(wire: SandboxWire) {
    if (!wire.envdAccessToken)
      throw new AuthenticationError(
        `Sandbox ${wire.sandboxID} did not return an envd access token`,
      );
    return new SandboxClient(wire.sandboxID, this, {
      domain: this.domain,
      sandboxDomain: wire.domain || this.domain,
      envdVersion: wire.envdVersion,
      envdAccessToken: wire.envdAccessToken,
    });
  }

  async create(
    templateOrOptions: string | SandboxCreateOptions,
    maybeOptions?: SandboxCreateOptions,
  ) {
    const template =
      typeof templateOrOptions === "string"
        ? templateOrOptions
        : DEFAULT_TEMPLATE;
    const options =
      typeof templateOrOptions === "string" ? maybeOptions : templateOrOptions;
    if (!options) throw new Error("Sandbox options are required");
    const response = await this.request("/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        templateID: template,
        metadata: options.metadata,
        envVars: options.envs,
        timeout: timeoutSeconds(options.timeoutMs),
        secure: true,
        allow_internet_access: true,
        network: options.network,
        autoPause: options.lifecycle?.onTimeout === "pause" || undefined,
      }),
    });
    await assertResponse(response);
    return this.instance((await response.json()) as SandboxWire);
  }

  async connect(sandboxId: string, options: SandboxConnectionOptions = {}) {
    const response = await this.request(
      `/sandboxes/${encodeURIComponent(sandboxId)}/connect`,
      {
        method: "POST",
        body: JSON.stringify({
          timeout: timeoutSeconds(options.timeoutMs ?? 300_000),
        }),
      },
    );
    await assertResponse(response, `Paused sandbox ${sandboxId} not found`);
    return this.instance((await response.json()) as SandboxWire);
  }

  async getInfo(sandboxId: string) {
    const response = await this.request(
      `/sandboxes/${encodeURIComponent(sandboxId)}`,
    );
    await assertResponse(response, `Sandbox ${sandboxId} not found`);
    return mapSandbox((await response.json()) as SandboxWire);
  }

  async pause(sandboxId: string) {
    const response = await this.request(
      `/sandboxes/${encodeURIComponent(sandboxId)}/pause`,
      { method: "POST", body: JSON.stringify({ memory: true }) },
    );
    if (response.status === 409) return false;
    await assertResponse(response, `Sandbox ${sandboxId} not found`);
    return true;
  }

  async kill(sandboxId: string) {
    const response = await this.request(
      `/sandboxes/${encodeURIComponent(sandboxId)}`,
      { method: "DELETE" },
    );
    if (response.status === 404) return false;
    await assertResponse(response);
    return true;
  }

  list(options: {
    query?: { metadata?: Record<string, string> };
    order?: "asc" | "desc";
    limit?: number;
  }) {
    return new SandboxPaginator(this, options);
  }

  async listPage(options: {
    query?: { metadata?: Record<string, string> };
    order?: "asc" | "desc";
    limit?: number;
    nextToken?: string;
  }) {
    const url = new URL("/v2/sandboxes", this.baseUrl);
    if (options.query?.metadata) {
      const encoded = Object.fromEntries(
        Object.entries(options.query.metadata).map(([key, value]) => [
          encodeURIComponent(key),
          encodeURIComponent(value),
        ]),
      );
      url.searchParams.set("metadata", new URLSearchParams(encoded).toString());
    }
    if (options.order) url.searchParams.set("order", options.order);
    if (options.limit) url.searchParams.set("limit", String(options.limit));
    if (options.nextToken) url.searchParams.set("nextToken", options.nextToken);
    const response = await this.request(`${url.pathname}${url.search}`);
    await assertResponse(response);
    return {
      items: ((await response.json()) as SandboxWire[]).map(mapSandbox),
      nextToken: response.headers.get("x-next-token") || undefined,
    };
  }
}

export class E2BClient {
  readonly Sandbox: SandboxApi;

  constructor(config: ClientConfig) {
    this.Sandbox = new SandboxApi(config);
  }
}
