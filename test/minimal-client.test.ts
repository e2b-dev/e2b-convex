import { afterEach, describe, expect, test, vi } from "vitest";
import { E2BClient } from "../src/component/e2b/client.js";

afterEach(() => vi.unstubAllGlobals());

describe("minimal E2B client", () => {
  test("creates a sandbox with the public control API wire shape", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return Response.json({
          sandboxID: "sandbox-1",
          envdVersion: "0.6.4",
          envdAccessToken: "token",
          domain: "e2b.app",
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new E2BClient({ apiKey: "secret" });
    const sandbox = await client.Sandbox.create("python", {
      timeoutMs: 1_001,
      metadata: { scope: "one" },
      envs: { NAME: "value" },
      network: { denyOut: ["0.0.0.0/0"] },
      lifecycle: { onTimeout: "pause" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.e2b.app/sandboxes");
    expect(new Headers(init?.headers).get("X-API-KEY")).toBe("secret");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      templateID: "python",
      envVars: { NAME: "value" },
      timeout: 2,
      secure: true,
      network: { denyOut: ["0.0.0.0/0"] },
      autoPause: true,
    });
    expect(sandbox.getHost(3000)).toBe("3000-sandbox-1.e2b.app");
  });

  test("reads list pagination from the response header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([], { headers: { "x-next-token": "page-two" } }),
      )
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    const paginator = new E2BClient({ apiKey: "secret" }).Sandbox.list({
      query: { metadata: { convex_ns: "namespace" } },
      order: "asc",
      limit: 100,
    });
    await paginator.nextItems();
    expect(paginator.hasNext).toBe(true);
    await paginator.nextItems();
    expect(paginator.hasNext).toBe(false);
    expect(String(fetchMock.mock.calls[1][0])).toContain("nextToken=page-two");
  });
});
