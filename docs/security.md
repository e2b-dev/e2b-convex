# Security

## Capabilities

Only tools named in `tools` are exposed. `getHost` is disabled by default. Each enabled tool accepts a boolean or async `needsApproval` rule; commands should normally require approval.

Scope and key resolvers fail closed. Use authenticated user IDs for scope and agent thread IDs for key. Do not substitute display names, email addresses, or client-provided ownership claims.

## Filesystem exposure

Read and write paths are canonicalized inside the sandbox. Reads resolve the target with `realpath`; writes resolve the nearest existing parent, preventing symlink escapes from configured roots. Defaults are `/home/user` and `/tmp`.

Roots reduce accidental exposure to file tools. They are not containment when `runCommand` is enabled: a shell command can access anything allowed to the sandbox user.

## Network and secrets

Prefer a deny-by-default E2B network policy and add only required destinations. Sandbox creation environment variables affect the generation fingerprint by name, not value. Changing a secret value does not automatically replace an existing sandbox; kill or sweep affected sandboxes during rotation.

`E2B_API_KEY` is read only inside component actions. Never pass it through tool input, metadata, or host action arguments.

## Limits

- Scope/key: 512 characters each.
- Command output: 32 KiB per stream by default.
- File reads: 64 KiB by default.
- File writes: 4 MiB.
- Directory depth: 8; returned entries: 1,000.

These are memory and exposure controls, not a substitute for E2B template hardening, non-root users, or network policy.
