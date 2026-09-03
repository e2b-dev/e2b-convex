import type { SandboxClient } from "./e2b/index.js";

const OUTPUT_DIRECTORY = "/tmp/.convex-e2b";
const TRUNCATION_MARKER = "\n... output truncated ...\n";

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function commandOutputPaths(id: string) {
  return {
    stdoutPath: `${OUTPUT_DIRECTORY}/${id}.out`,
    stderrPath: `${OUTPUT_DIRECTORY}/${id}.err`,
  };
}

export function wrapCommand(
  command: string,
  stdoutPath: string,
  stderrPath: string,
  timeoutMs?: number,
) {
  const duration = timeoutMs ? `${Math.max(timeoutMs, 1) / 1_000}s` : undefined;
  const executedCommand = duration
    ? `timeout --signal=TERM --kill-after=2s ${shellQuote(duration)} sh -c ${shellQuote(command)}`
    : `sh -c ${shellQuote(command)}`;
  return [
    `mkdir -p ${shellQuote(OUTPUT_DIRECTORY)}`,
    `${executedCommand} >${shellQuote(stdoutPath)} 2>${shellQuote(stderrPath)}`,
    "code=$?",
    `printf '%s\\n' "$code"`,
  ].join("; ");
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const chunk =
        value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
  } finally {
    if (total >= maxBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function materializeSlice(
  sandbox: SandboxClient,
  sourcePath: string,
  offset: number,
  count: number,
) {
  const id = crypto.randomUUID();
  const target = `${OUTPUT_DIRECTORY}/${id}.slice`;
  await sandbox.commands.run(
    `mkdir -p ${shellQuote(OUTPUT_DIRECTORY)}; dd if=${shellQuote(sourcePath)} of=${shellQuote(target)} bs=64K skip=${offset} count=${count} iflag=skip_bytes,count_bytes status=none`,
    { timeoutMs: 60_000 },
  );
  return target;
}

export async function readBoundedFile(
  sandbox: SandboxClient,
  path: string,
  maxBytes: number,
  offset = 0,
) {
  const info = await sandbox.files.getInfo(path);
  const available = Math.max(0, info.size - offset);
  const count = Math.min(maxBytes, available);
  if (count === 0) {
    return { content: "", bytes: info.size, truncated: available > 0 };
  }
  const readPath =
    offset === 0 && info.size <= maxBytes
      ? path
      : await materializeSlice(sandbox, path, offset, count);
  try {
    const stream = await sandbox.files.read(readPath, { format: "stream" });
    return {
      content: await readStream(stream, count),
      bytes: info.size,
      truncated: available > maxBytes,
    };
  } finally {
    if (readPath !== path) {
      await sandbox.commands
        .run(`rm -f -- ${shellQuote(readPath)}`)
        .catch(() => undefined);
    }
  }
}

export async function readHeadTail(
  sandbox: SandboxClient,
  path: string,
  maxBytes: number,
) {
  const info = await sandbox.files.getInfo(path);
  if (info.size <= maxBytes) return readBoundedFile(sandbox, path, maxBytes);

  const markerBytes = new TextEncoder().encode(TRUNCATION_MARKER).byteLength;
  const payloadBytes = Math.max(0, maxBytes - markerBytes);
  const headBytes = Math.ceil(payloadBytes / 2);
  const tailBytes = Math.floor(payloadBytes / 2);
  const [head, tail] = await Promise.all([
    readBoundedFile(sandbox, path, headBytes, 0),
    readBoundedFile(sandbox, path, tailBytes, info.size - tailBytes),
  ]);
  return {
    content: `${head.content}${TRUNCATION_MARKER}${tail.content}`,
    bytes: info.size,
    truncated: true,
  };
}
