# changesets-changelog-gitea

A changelog entry generator for [changesets](https://github.com/changesets/changesets)
that links to Gitea commits, pull requests and users. It is a Gitea port of
[`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github).

The Gitea API client is generated at install time from the **Gitea 1.27**
OpenAPI spec (`https://docs.gitea.com/openapi3-27.json`) using
[`openapi-typescript`](https://openapi-ts.dev) and [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch)
(see `scripts/generate-gitea-schema.js`).

## Requirements

- A Gitea instance version **1.27 or newer**, as the API client is generated
  from the Gitea 1.27 OpenAPI spec.
- A Gitea access token with `read:repository` scope (see
  [Environment variables](#environment-variables)).

## Install

```bash
npm install --save-dev changesets-changelog-gitea
```

```bash
pnpm add --save-dev changesets-changelog-gitea
```

```bash
yarn add --dev changesets-changelog-gitea
```

```bash
bun add --dev changesets-changelog-gitea
```

## Usage

Configure `changelog` in your `.changeset/config.json`:

```json
{
  "changelog": ["changesets-changelog-gitea", { "serverUrl": "https://gitea.example.com/", "repo": "org/repo" }]
}
```

Alternatively, set the repository via the `GITEA_REPOSITORY` and `GITEA_SERVER_URL`
environment variables instead of passing `repo`/`serverUrl` options. Options take
precedence over environment variables.

### Environment variables

| Variable            | Description                                                            | Default          |
| ------------------- | ---------------------------------------------------------------------- | ---------------- |
| `GITEA_SERVER_URL`  | Base URL of your Gitea instance. Required unless the `serverUrl` option is given. | —      |
| `GITEA_REPOSITORY`  | Repository in the form `org/repo` (alternative to the `repo` option).  | —                |
| `GITEA_TOKEN`       | Required. Gitea access token (needs `read:repository` scope).          | —                |

A `.env` file in the working directory is also loaded; already-set environment
variables take precedence. Unlike `dotenv`, the file is parsed without mutating
`process.env`.

## Options

### `repo`

- **Type:** `string`
- **Default:** `process.env.GITEA_REPOSITORY`

Specify the `<org>/<repo>` slug of your Gitea repository. If you intend to run
this locally, specify the option explicitly or set the `GITEA_REPOSITORY`
environment variable.

### `serverUrl`

- **Type:** `string`
- **Default:** `process.env.GITEA_SERVER_URL`

Base URL of your Gitea instance, e.g. `https://gitea.example.com/`. Trailing
slashes are stripped. Required unless `GITEA_SERVER_URL` is set.

### `disableThanks`

- **Type:** `boolean`
- **Default:** `false`

Set `true` to drop the `"Thanks [@user]!"` attribution from each line.

> [!NOTE]
> It is recommended to not set `"disableThanks": true` when using the `template`
> option as the `{authors}` token would return an empty string, which could lead
> to unexpected results.

### `template`

- **Type:** `string`
- **Experimental**

> [!WARNING]
> **Experimental.** The `template` option and its token syntax may change in any
> release, including a patch. If you rely on it, pin the exact version of
> `changesets-changelog-gitea`.

This option allows you to customize the format that should be used for the
generation of a single changelog line. For example, the default template
generates this Markdown:

```md
- [#123](https://gitea.example.com/org/repo/pull/123) [`a1b2c3d`](https://gitea.example.com/org/repo/commit/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0) Thanks [@ghost](https://gitea.example.com/ghost)! - fix the thing
```

Each piece of information can be dynamically represented with [tokens](#tokens).
The above example can be represented as:

```
\n\n- {pull} {commit} Thanks {authors}! - {summary}
```

#### Tokens

The `template` option supports these tokens.

| Token       | Description                                                                              | Example              |
| ----------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `{summary}` | The first line of the changeset Markdown content.                                        | `fix the thing`      |
| `{ref}`     | Link to either the PR or commit (if the changes were pushed directly). Wrapped in parenthesis. | `([#123](url))` |
| `{pull}`    | Link to the PR if available.                                                             | `[#123](url)`        |
| `{commit}`  | Link to the commit.                                                                      | ``[`abc1234`](url)`` |
| `{authors}` | Link to the Gitea user profile of the main author of the commit (and PR).                | `[@ghost](url)`      |

> [!NOTE]
> If a token is used and its data is absent, the token will generate an empty
> string. The continuation lines of a multi-line summary are also always appended
> below the template, indented by two spaces.

Examples:

| `template`                                              | Generated Markdown                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `"\n\n- {pull} {commit} Thanks {authors}! - {summary}"` | ``\n\n- [#123](url) [`abc1234`](url) Thanks [@ghost](url)! - fix the thing``  |
| `"\n\n- {summary} {ref}"`                               | `\n\n- fix the thing ([#123](url))` or ``- fix the thing ([`abc1234`](url))`` |
| `"\n\n- {summary} (thanks {authors}!)"`                 | `\n\n- fix the thing (thanks [@ghost](url)!)`                                 |
| `"\n\n- {summary} {pull}"`                              | `\n\n- fix the thing [#123](url)`                                             |

### Summary keywords

Release lines generated from a changeset summary support the same keywords as
`@changesets/changelog-github`:

- `PR: #123` / `pull: 123` / `pull request: #123` — link to the pull request
- `commit: abc123` — link to a commit
- `author: user` / `user: @user` — thank a user

The keywords must sit at the **start of a line** (leading whitespace is
allowed); anywhere else they are treated as plain summary text. Each matched
keyword (from the start of the line up to the number or user name) is removed
from the summary before it is written to the changelog:

```md
---
"my-package": patch
---

Fix an edge case in the parser.

PR: #123
author: @ghost
```

Notes on how the keywords interact:

- `PR:` (or `pull:` / `pull request:`) takes precedence: the release line
  links to that pull request instead of resolving the commit. This is mostly
  needed when the pull request is old, or to attribute a change to a pull
  request that the [auto detection](#auto-pull-request-detection) below
  cannot find (e.g. beyond its scan window).
- `commit:` given together with `PR:` overrides the commit link with the given
  commit, instead of using the pull request's merge commit.
- Without any keyword, the generator links the commit that introduced the
  changeset (found via git history) — or, when that commit has no pull
  request association, the pull request that merged it (see [auto pull
  request detection](#auto-pull-request-detection)).
- `author:` / `user:` may be repeated on separate lines to thank several
  users; when omitted, the author of the commit (or pull request) is used.
- Only the first `PR:` / `pull:` line and the first `commit:` line are
  consumed.

> [!WARNING]
> A keyword that is not at the start of a line is silently ignored. For
> example, `…the parser. PR: #123` keeps `PR: #123` in the summary, and the
> bare `#123` is then turned into an *issue* reference (see below) instead of
> a pull request link.

#### Bare issue references

Any bare `#123` in the summary that is not part of an existing Markdown link
is linked to the corresponding issue page:

`[#123](<serverUrl>/<repo>/issues/123)`

Gitea redirects `/issues/123` to `/pulls/123` when the number belongs to a
pull request, so the link works for pull requests too. Existing links are left
untouched, and numbers preceded by a word character (e.g. `C#1`) are not
linkified.

### Auto pull request detection

On Gitea, only *merge commits* are linked to their pull request, while
Changesets reports the commit that first added the changeset — for a change
merged through a pull request that is the feature-branch commit, which Gitea
does not associate with the PR. When the changeset has no `PR:` keyword and
the reported commit has no linked pull request, the generator scans the
repository's merged pull requests (newest first) for the one whose commit
list contains the commit, and links that pull request. Merge-commit merges
therefore produce PR links automatically, just like squash merges and like
GitHub (where any commit that was part of a merged pull request stays linked
to it).

The lookup is best-effort and silent. It is skipped entirely when the commit
already has a pull request association (merge and squash commits), and it
stops after the most recent ~60 merged pull requests — beyond that window,
and for commits pushed directly to the base branch, the release line keeps a
plain commit link. It costs one pull-request listing request per page plus
one request per merged pull request examined; results are cached per
repository and commit. When the repository is not accessible the generator
falls back to the commit-only line.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

The Gitea API types in `src/generated/` are generated by `pnpm gitea:types`
(also run automatically on `pnpm install` via the `prepare` script). The
script downloads the pinned Gitea 1.27 OpenAPI spec, verifies its SHA-256
checksum, caches it under `node_modules/.cache/gitea` and writes the typed
schema to `src/generated/gitea-schema.ts`. To pin a different Gitea version,
update `GITEA_VERSION`, `SPEC_URL` and `SPEC_SHA256` in the script.
