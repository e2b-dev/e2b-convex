# Publishing

`@e2b/convex` is distributed through npm. A consumer installs the package, imports its component config, and Convex deploys an isolated component instance as part of the consumer's application. The Convex Components Directory is a separate discovery and review channel after the npm release.

## One-time setup

1. Confirm who holds each permission before starting. Repo admin flips visibility and sets branch protection. An npm `e2b` org admin (or `developers` team member) runs the first publish and configures the trusted publisher. Only a GitHub org owner can add this repo to the `e2b-version-bumper` app installation (App ID 1070451) at https://github.com/organizations/e2b-dev/settings/installations; `release.yml` needs it to open the version pull request with CI attached.
2. Make the repository public. Before flipping: scan the full git history for secrets (`gitleaks git .`), confirm `LICENSE` matches `package.json`, `CODEOWNERS` exists, and `main` has branch protection requiring the `verify` check.
3. Publish the first public release with a maintainer-controlled npm account and 2FA:

   ```sh
   npm ci
   npm run prepack
   npm publish --access public --provenance=false
   ```

4. On npmjs.com, open `@e2b/convex` → Settings → Trusted Publisher and configure:
   - Provider: GitHub Actions
   - Organization: `e2b-dev`
   - Repository: `e2b-convex`
   - Workflow: `release.yml` (filename only)
   - Environment: leave empty; the workflow declares none, and a value here makes the OIDC claims mismatch
   - Allowed action: `npm publish`

   Or from the CLI: `npm trust github @e2b/convex --repo e2b-dev/e2b-convex --file release.yml --allow-publish`. npm does not validate these fields on save; a typo surfaces later as `ENEEDAUTH`.

5. Verify one OIDC release, then disallow token-based publishing for the package.

The bootstrap publish is necessary because npm trusted-publisher settings belong to an existing package. The bootstrap version therefore ships without a provenance attestation. That is expected; do not introduce an npm token to attest it. The first CI release is the first attested one.

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
3. Merge to `main`. The Changesets action creates or updates a version pull request using the `e2b-version-bumper` app token, so CI runs on it.
4. Review the generated version and changelog, then merge the version pull request.
5. The release workflow runs `changeset publish` through npm trusted publishing. npm automatically attaches provenance for a public package built from the public GitHub repository.
6. Verify from the registry, not from CI. A token publish ships identical bytes without attestation, so this is the only check that proves OIDC was used:

   ```sh
   npm view @e2b/convex --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dist-tags']['latest'], '| attestations:', 'YES' if d.get('dist',{}).get('attestations') else 'NONE')"
   ```

7. Install the exact published version in a clean Convex app, and run one minimal action plus one Agent tool call.

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
