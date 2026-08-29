---
"changesets-changelog-gitea": minor
---

Replace the `@go-gitea/sdk.js` dependency with a typed Gitea API client generated from the Gitea 1.27 OpenAPI spec using `openapi-typescript` and `openapi-fetch`. The generated client (in `src/generated/`) is created at install time by the `prepare` script and is type-only, so the published bundle now depends on `openapi-fetch` instead of `@go-gitea/sdk.js`.
