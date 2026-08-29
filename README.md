# changesets-changelog-gitea

A changelog entry generator for [changesets](https://github.com/changesets/changesets)
that links to Gitea commits, pull requests and users. It is a Gitea port of
[`@changesets/changelog-github`](https://github.com/changesets/changesets/tree/main/packages/changelog-github)
and uses the official [`@go-gitea/sdk.js`](https://www.npmjs.com/package/@go-gitea/sdk.js)
client for all Gitea API calls.

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

- `PR: #123` / `pull: 123` — link to the pull request
- `commit: abc123` — link to a commit
- `author: user` / `user: @user` — thank a user

## Development

```bash
pnpm install
pnpm build
pnpm test
```
