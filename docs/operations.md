# Operations

## Namespace

The default namespace is derived from `CONVEX_SITE_URL`, isolating development and production deployments without configuration. Bind `E2B_NAMESPACE` when several deployments intentionally share sandboxes or when a stable namespace must survive a deployment URL change.

Never reuse a namespace across unrelated applications.

## Cleanup

Pause or kill a sandbox before deleting its owning Agent thread:

```ts
await e2b.kill(ctx, { scope: userId, key: threadId });
await agent.deleteThreadSync(ctx, { threadId });
```

For user deletion, repeat `killScope` while it returns `more: true`, then delete the user's threads. `sweep` removes duplicates and malformed namespace-owned entries older than the supplied age. Both operations kill at most 100 sandboxes per call.

## Policy migrations

Changing the template, network policy, or environment-variable names changes `convex_gen`. Existing identities then fail with `ConfigurationConflict`. If data must be exported, temporarily use an `E2B` client configured with the previous policy to read it. The current client can kill the owned stale-generation sandbox, after which the next operation creates one under the new policy.

## Known constraints

- Discovery is best-effort and tableless; simultaneous first calls can create duplicates.
- E2B list-by-metadata rate limits and read-after-write behavior still need production-load characterization.
- List and sweep currently scan namespace matches before bounding the returned
  or killed batch so the public list cursor remains independent of short-lived
  E2B API pagination tokens.
- Long command output is bounded but not relayed live.
- Command stdout and stderr files remain at their returned sandbox paths. Remove
  them after collecting any needed full output, or rely on sandbox teardown.
