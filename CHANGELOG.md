# changesets-changelog-gitea

## 0.2.0

### Minor Changes

- [#9](https://github.com/anytinz/changesets-changelog-gitea/pull/9) [`4f8ac2e`](https://github.com/anytinz/changesets-changelog-gitea/commit/4f8ac2e9e4f35a2f981936968f9721d6353ba16b) Thanks [@anytinz](https://github.com/anytinz)! - Replace the `@go-gitea/sdk.js` dependency with a typed Gitea API client generated from the Gitea 1.27 OpenAPI spec using `openapi-typescript` and `openapi-fetch`. The generated client (in `src/generated/`) is created at install time by the `prepare` script and is type-only, so the published bundle now depends on `openapi-fetch` instead of `@go-gitea/sdk.js`.

## 0.1.1

### Patch Changes

- [#4](https://github.com/anytinz/changesets-changelog-gitea/pull/4) [`6927624`](https://github.com/anytinz/changesets-changelog-gitea/commit/69276249a3c0cf1b4f575d0b06968733645520f2) Thanks [@anytinz](https://github.com/anytinz)! - Verify OIDC trusted publishing workflow.

## 0.1.0

### Minor Changes

- [`acbabde`](https://github.com/anytinz/changesets-changelog-gitea/commit/acbabdeb706a7b15e0f5062108a29a8f3c80764f) Thanks [@anytinz](https://github.com/anytinz)! - Initial release: Gitea port of @changesets/changelog-github that links release lines to commits, pull requests and users.
