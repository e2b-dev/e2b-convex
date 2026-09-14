import type { SandboxClient } from "./e2b/index.js";
import { shellQuote } from "./output";
import { ConvexError } from "convex/values";

export const DEFAULT_ROOTS = ["/home/user", "/tmp"];

function absolutePath(path: string) {
  if (path.includes("\0")) throw new Error("Path must not contain NUL bytes");
  return path.startsWith("/") ? path : `/home/user/${path}`;
}

function isInsideRoot(path: string, root: string) {
  return path === root || path.startsWith(`${root}/`);
}

async function canonicalRoots(sandbox: SandboxClient, roots: string[]) {
  const result = await Promise.all(
    roots.map(async (root) => {
      // A missing root grants nothing instead of failing every request.
      const resolved = await sandbox.commands.run(
        `realpath -e -- ${shellQuote(root)} 2>/dev/null || true`,
      );
      return resolved.stdout.trim();
    }),
  );
  return result.filter(Boolean);
}

export async function assertReadablePath(
  sandbox: SandboxClient,
  requestedPath: string,
  roots = DEFAULT_ROOTS,
) {
  const path = absolutePath(requestedPath);
  let resolved: string;
  try {
    resolved = (
      await sandbox.commands.run(`realpath -e -- ${shellQuote(path)}`)
    ).stdout.trim();
  } catch (error) {
    throw new ConvexError({
      code: "FileNotFound",
      message: `File or directory does not exist: ${requestedPath}`,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!resolved) {
    throw new ConvexError({
      code: "FileNotFound",
      message: `File or directory does not exist: ${requestedPath}`,
    });
  }
  await assertInsideRoots(sandbox, resolved, roots, requestedPath);
  return resolved;
}

export async function assertWritablePath(
  sandbox: SandboxClient,
  requestedPath: string,
  roots = DEFAULT_ROOTS,
) {
  const path = absolutePath(requestedPath);
  const resolved = (
    await sandbox.commands.run(`realpath -m -- ${shellQuote(path)}`)
  ).stdout.trim();
  await assertInsideRoots(sandbox, resolved, roots, requestedPath);
  return resolved;
}

async function assertInsideRoots(
  sandbox: SandboxClient,
  resolved: string,
  roots: string[],
  requestedPath: string,
) {
  const allowedRoots = await canonicalRoots(sandbox, roots);
  if (!allowedRoots.some((root) => isInsideRoot(resolved, root))) {
    throw new ConvexError({
      code: "CapabilityDenied",
      message: `Path is outside the configured roots: ${requestedPath}`,
    });
  }
}
