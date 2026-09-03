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
      const resolved = await sandbox.commands.run(
        `realpath -e -- ${shellQuote(root)}`,
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
  const allowedRoots = await canonicalRoots(sandbox, roots);
  if (!allowedRoots.some((root) => isInsideRoot(resolved, root))) {
    throw new Error(
      `Path is outside the configured read roots: ${requestedPath}`,
    );
  }
  return resolved;
}

export async function assertWritablePath(
  sandbox: SandboxClient,
  requestedPath: string,
  roots = DEFAULT_ROOTS,
) {
  const path = absolutePath(requestedPath);
  const script = [
    `target=${shellQuote(path)}`,
    'if [ -e "$target" ] || [ -L "$target" ]; then realpath -e -- "$target"; exit; fi',
    'parent=$(dirname -- "$target")',
    'while [ ! -e "$parent" ]; do next=$(dirname -- "$parent"); [ "$next" = "$parent" ] && exit 2; parent="$next"; done',
    'base=$(realpath -e -- "$parent")',
    'suffix=${target#"$parent"}',
    'printf "%s%s\\n" "$base" "$suffix"',
  ].join("; ");
  const resolved = (await sandbox.commands.run(script)).stdout.trim();
  const allowedRoots = await canonicalRoots(sandbox, roots);
  if (!allowedRoots.some((root) => isInsideRoot(resolved, root))) {
    throw new Error(
      `Path is outside the configured write roots: ${requestedPath}`,
    );
  }
  return resolved;
}
