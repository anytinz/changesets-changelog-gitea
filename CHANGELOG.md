# changesets-changelog-gitea

## 0.4.0

### Minor Changes

- [#21](https://github.com/anytinz/changesets-changelog-gitea/pull/21) [`dc97b21`](https://github.com/anytinz/changesets-changelog-gitea/commit/dc97b21a72095f169f0ec16e2cd82fac791bed1d) Thanks [@anytinz](https://github.com/anytinz)! - Resolve pull request links for changes merged with a merge commit. Gitea only
  links *merge commits* to their pull request, while Changesets reports the
  commit that first added the changeset (the feature-branch commit for a
  PR-merged change), so such changelog lines used to lack a PR link. The
  generator now scans the repository's merged pull requests for the one whose
  commit list contains the changeset commit, and links that pull request.

## 0.3.1

### Patch Changes

- [#19](https://github.com/anytinz/changesets-changelog-gitea/pull/19) [`a0683de`](https://github.com/anytinz/changesets-changelog-gitea/commit/a0683def0e538527bfdea1c37192b3165670d6c8) Thanks [@anytinz](https://github.com/anytinz)! - fix: add prepublishOnly script to include dist

## 0.3.0

### Minor Changes

- [#11](https://github.com/anytinz/changesets-changelog-gitea/pull/11) [`c841a64`](https://github.com/anytinz/changesets-changelog-gitea/commit/c841a64b5ab1cef2ff8c5f0d6af450eeb924bfa3) Thanks [@anytinz](https://github.com/anytinz)! - Narrow the supported Node.js range so that `^24.11` is the minimum supported 24.x release.

## 0.2.0

### Minor Changes

- [#9](https://github.com/anytinz/changesets-changelog-gitea/pull/9) [`4f8ac2e`](https://github.com/anytinz/changesets-changelog-gitea/commit/4f8ac2e9e4f35a2f981936968f9721d6353ba16b) Thanks [@anytinz](https://github.com/anytinz)! - Replace the `@go-gitea/sdk.js` dependency with a typed Gitea API client generated from the Gitea 1.27 OpenAPI spec using `openapi-typescript` and `openapi-fetch`. The generated client (in `src/generated/`) is created at install time by the `prepare` script and is type-only, so the published bundle now depends on `openapi-fetch` instead of `@go-gitea/sdk.js`.

## 0.1.1

### Patch Changes

- [#4](https://github.com/anytinz/changesets-changelog-gitea/pull/4) [`6927624`](https://github.com/anytinz/changesets-changelog-gitea/commit/69276249a3c0cf1b4f575d0b06968733645520f2) Thanks [@anytinz](https://github.com/anytinz)! - Verify OIDC trusted publishing workflow.

## 0.1.0

### Minor Changes

- [`acbabde`](https://github.com/anytinz/changesets-changelog-gitea/commit/acbabdeb706a7b15e0f5062108a29a8f3c80764f) Thanks [@anytinz](https://github.com/anytinz)! - Initial release: Gitea port of @changesets/changelog-github that links release lines to commits, pull requests and users.
