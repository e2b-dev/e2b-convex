# Contributing

Use Node.js 20 or newer. The component and example share the root package and
`node_modules`; do not add a nested package to `example`. Run `npm install`,
`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run
example:build` before submitting changes.

The checked-in envd protocol descriptors are generated from the pinned E2B
development dependency. After changing that version, run `npm run
protocol:update` and review the resulting protocol and real-service tests.

Component API changes must include `args` and `returns` validators, tests, and documentation. No component action may use `"use node"`.
