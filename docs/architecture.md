# Architecture

`@e2b/convex` is a tableless Convex component. A host action calls a component action, which makes one E2B API operation from Convex's default V8 runtime. The E2B API key is a component environment variable and never crosses the component boundary.

## Identity

Each sandbox has five metadata keys:

- `convex_ns`: an explicit namespace or a short SHA-256 digest of `CONVEX_SITE_URL`.
- `convex_scope_h`: SHA-256 of the length-framed scope.
- `convex_key_h`: SHA-256 of the length-framed scope and key.
- `convex_gen`: a fingerprint of template, network policy, and environment-variable names.
- `convex_schema`: currently `1`.

Scope and key are limited to 512 characters and are never stored in E2B metadata. A generation mismatch throws `ConfigurationConflict` rather than silently reusing a sandbox created under another policy.

## Resolution

`getOrCreate` lists running and paused sandboxes by identity in oldest-first order. It connects to the oldest match (resuming it if paused), refreshes its timeout, or creates a sandbox with `lifecycle.onTimeout = "pause"`.

The component deliberately has no coordination table. Tool sets pin the sandbox per scope/key on first use, so parallel tool calls inside one generation share a single `getOrCreate`. Cross-action creation races can still leave one duplicate; oldest-first lookup makes later calls converge and `sweep` removes duplicates.

Every exec action validates a supplied sandbox ID against all identity metadata. A typed E2B sandbox-not-found error falls back to normal discovery/creation; authorization and configuration errors propagate.

## Bounded output

To stay below Convex action limits, commands are wrapped so stdout and stderr go directly to sandbox files and the Process stream sees only one exit-code line. The component streams bounded head/tail slices of those files and returns their paths and original byte sizes.

The envd file endpoint does not expose byte offsets for streamed reads. Offset and tail reads therefore materialize a bounded `dd` slice in `/tmp/.convex-e2b` before streaming it, then remove that slice. The original stdout and stderr files remain available at the returned paths until callers remove them or the sandbox is killed.

Command timeouts use GNU `timeout` inside the sandbox. The Connect request deadline has an additional transport grace period, avoiding a stream-abort failure in Convex's V8 runtime while preserving partial output.

## Minimal V8 client

The component uses a purpose-built V8 client. Control-plane and file-transfer
operations use native Fetch; command execution and filesystem metadata use
Connect-Web with only E2B's Process and Filesystem protobuf descriptors. The
component does not ship or import the full E2B JavaScript SDK. The pinned SDK is
a development-only protocol source used by `npm run protocol:update`.

`verify-runtime.mjs` rejects Node builtin and full `e2b` imports in the emitted
component client and enforces a size ceiling. Nightly real-service tests detect
API or protocol drift.
