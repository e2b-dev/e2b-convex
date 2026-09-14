# Publishing

`@e2b/convex` is distributed through npm. A consumer installs the package, imports its component config, and Convex deploys an isolated component instance as part of the consumer's application. The Convex Components Directory is a separate discovery and review channel after the npm release.

## One-time setup

1. Confirm the public GitHub repository is `e2b-dev/e2b-convex` and the npm `@e2b` organization has granted package publishing access.
2. Publish the first public release with a maintainer-controlled npm account and 2FA:

   ```sh
   npm ci
   npm run prepack
   npm publish --access public --provenance=false
   ```

3. On npmjs.com, open `@e2b/convex` → Settings → Trusted Publisher and configure:
   - Provider: GitHub Actions
   - Organization: `e2b-dev`
   - Repository: `e2b-convex`
   - Workflow: `release.yml`
   - Allowed action: `npm publish`
4. Verify one OIDC release, then disallow token-based publishing for the package.

The bootstrap publish is necessary because npm trusted-publisher settings belong to an existing package. If the first version must also carry provenance, perform the bootstrap from a GitHub-hosted workflow using a short-lived granular npm token, then remove the token immediately.

## Package contract

Before every release, verify that the tarball contains:

- `dist/client` for `@e2b/convex`, `/agent`, and `/ai`.
- `dist/component/convex.config.*` for `/convex.config.js`.
- `dist/component/_generated/component.*` for Convex component typing.
- `src/test.ts` and `src/component` for the Vite-transformed `/test` helper.
- `README.md`, `LICENSE`, and E2B's vendored protocol license.

Run:

```sh
npm ci
npm run protocol:update
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run example:build
npm run verify:runtime
npm pack --dry-run
```

The protocol update must leave no unexplained diff. The scheduled real-service E2E suite must pass against the supported E2B API and envd versions before promoting a stable release.

## Release flow

1. Add a Changeset describing user-visible changes.
2. Open a pull request and let CI validate codegen, tests, the emitted V8 runtime, and package contents.
3. Merge to `main`. The Changesets action creates or updates a version pull request.
4. Review the generated version and changelog, then merge the version pull request.
5. The release workflow runs `changeset publish` through npm trusted publishing. npm automatically attaches provenance for a public package built from the public GitHub repository.
6. Verify the npm page, install the exact published version in a clean Convex app, and run one minimal action plus one Agent tool call.

The initial `0.1.0` release publishes to npm's `latest` tag. Treat the API as pre-1.0 and require the real-service suite and clean-consumer smoke test before publishing.

## Convex Components Directory

Publishing to npm makes the component usable. Directory inclusion requires a separate submission through the [Convex Components submissions page](https://www.convex.dev/components/submissions) after publication. Prepare:

- npm package URL and public source repository.
- Clear installation and secret-binding instructions.
- Minimal and agentic examples.
- Security, data isolation, and cleanup documentation.
- Passing CI and evidence that the package does not require Node in component actions.
- An optional 16:9 directory thumbnail at 1536 × 864 pixels.

Submit only after the npm package and documentation URLs are permanent.
