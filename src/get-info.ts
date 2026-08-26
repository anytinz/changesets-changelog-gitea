import { Gitea, RequestError } from '@go-gitea/sdk.js'
import { ENV } from '@/env'
import { isFullString, normalizeServerUrl } from '@/helper'

export interface CommitInfoOptions {
  readonly serverUrl?: string
  readonly repo: string
  readonly commit: string
}

export interface CommitInfo {
  readonly pull?: {
    readonly number: number
    readonly url: string
    readonly markdownLink: string
  }
  readonly commit: {
    readonly sha: string
    readonly url: string
    readonly markdownLink: string
  }
  readonly author?: {
    readonly login: string
    readonly url: string
    readonly markdownLink: string
  }
}

export interface PullRequestInfoOptions {
  readonly serverUrl?: string
  readonly repo: string
  readonly pull: number
}

export interface PullRequestInfo {
  readonly pull: {
    readonly number: number
    readonly url: string
    readonly markdownLink: string
  }
  readonly author?: {
    readonly login: string
    readonly url: string
    readonly markdownLink: string
  }
  readonly commit?: {
    readonly sha: string
    readonly url: string
    readonly markdownLink: string
  }
}

const validRepoNameRegex = /^[\w.-]+\/[\w.-]+$/u

const validateRepoName = (repo: string): void => {
  if (!validRepoNameRegex.test(repo)) {
    throw new Error(
      `Please pass a valid Gitea repository in the form of "userOrOrg/repoName". Received: ${JSON.stringify(repo)}.`,
    )
  }
}

const getGiteaClient = (
  serverUrl: string | undefined,
): { gitea: Gitea; serverUrl: string } => {
  const { GITEA_SERVER_URL, GITEA_TOKEN } = ENV
  const resolvedServerUrl = serverUrl ?? GITEA_SERVER_URL
  if (resolvedServerUrl === null) {
    throw new Error(
      'Please provide a server URL to this changelog generator like this:\n"changelog": ["@changesets/changelog-gitea", { "serverUrl": "https://gitea.example.com" }]\nor set the GITEA_SERVER_URL environment variable.',
    )
  }
  if (!isFullString(GITEA_TOKEN)) {
    throw new TypeError(
      `Please create a Gitea access token at ${normalizeServerUrl(resolvedServerUrl)}/user/settings/applications with \`read:repository\` permission and add it as the GITEA_TOKEN environment variable`,
    )
  }
  return {
    gitea: new Gitea({
      baseUrl: normalizeServerUrl(resolvedServerUrl),
      auth: GITEA_TOKEN,
    }),
    serverUrl: normalizeServerUrl(resolvedServerUrl),
  }
}

const splitRepo = (repo: string): [owner: string, name: string] => {
  const [owner, name] = repo.split('/')
  if (owner === undefined || name === undefined) {
    throw new Error(
      `Please pass a valid Gitea repository in the form of "userOrOrg/repoName". Received: ${JSON.stringify(repo)}.`,
    )
  }
  return [owner, name]
}

const isNotFound = (error: unknown): boolean => {
  return error instanceof RequestError && error.status === 404
}

/*
  Results are cached per repo+sha / repo+number so that multiple release lines
  referencing the same commit or PR don't trigger duplicate API requests.
*/
const loadCached = async <T>(
  cache: Map<string, Promise<T>>,
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const entry = fn().catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, entry)
  return entry
}

const commitCache = new Map<string, Promise<CommitInfo | null>>()
const pullCache = new Map<string, Promise<PullRequestInfo | null>>()

/**
 * Get the information of a specific commit in a Gitea repository. Returns
 * `undefined` if the commit is not found or the Gitea repository doesn't exist.
 */
export const getCommitInfo = async (
  options: CommitInfoOptions,
): Promise<CommitInfo | null> => {
  validateRepoName(options.repo)

  return loadCached<CommitInfo | null>(commitCache, `commit:${options.repo}:${options.commit}`, async () => {
    const { gitea } = getGiteaClient(options.serverUrl)
    const [owner, repo] = splitRepo(options.repo)

    const commitResponse = await gitea.rest.repository
      .repoGetSingleCommit({
        owner,
        repo,
        sha: options.commit,
      })
      .catch((error) => {
        if (isNotFound(error)) {
          return
        }
        throw error
      })
    if (commitResponse === undefined) {
      return null
    }
    const data = commitResponse.data

    const pullResponse = await gitea.rest.repository
      .repoGetCommitPullRequest({
        owner,
        repo,
        sha: options.commit,
      })
      .catch((error) => {
        if (isNotFound(error)) {
          return
        }
        throw error
      })
    const pr = pullResponse?.data

    const commitUrl = data.html_url
    if (commitUrl === undefined) {
      return null
    }

    const author = pr?.user ?? data.author

    return {
      pull:
        pr?.number !== undefined && pr.html_url !== undefined
          ? {
            number: pr.number,
            url: pr.html_url,
            markdownLink: `[#${pr.number}](${pr.html_url})`,
          }
          : undefined,
      commit: {
        sha: options.commit,
        url: commitUrl,
        markdownLink: `[\`${options.commit.slice(0, 7)}\`](${commitUrl})`,
      },
      author:
        author?.login !== undefined && author.html_url !== undefined
          ? {
            login: author.login,
            url: author.html_url,
            markdownLink: `[@${author.login}](${author.html_url})`,
          }
          : undefined,
    }
  })
}

/**
 * Get the information of a specific pull request in a Gitea repository.
 * Returns `undefined` if the pull request is not found or the Gitea repository
 * doesn't exist.
 */
export const getPullRequestInfo = async (
  options: PullRequestInfoOptions,
): Promise<PullRequestInfo | null> => {
  validateRepoName(options.repo)

  return loadCached<PullRequestInfo | null>(pullCache, `pull:${options.repo}:${options.pull}`, async () => {
    const { gitea, serverUrl } = getGiteaClient(options.serverUrl)
    const [owner, repo] = splitRepo(options.repo)

    const pullResponse = await gitea.rest.repository
      .repoGetPullRequest({
        owner,
        repo,
        index: options.pull,
      })
      .catch((error) => {
        if (isNotFound(error)) {
          return
        }
        throw error
      })
    if (pullResponse === undefined) {
      return null
    }
    const data = pullResponse.data

    const pullUrl = data.html_url
    if (pullUrl === undefined) {
      return null
    }

    const mergeCommitSha = data.merge_commit_sha
    const mergeCommitUrl = typeof mergeCommitSha === 'string'
      ? `${serverUrl}/${options.repo}/commit/${mergeCommitSha}`
      : undefined

    return {
      pull: {
        number: options.pull,
        url: pullUrl,
        markdownLink: `[#${options.pull}](${pullUrl})`,
      },
      author:
        data.user?.login !== undefined && data.user.html_url !== undefined
          ? {
            login: data.user.login,
            url: data.user.html_url,
            markdownLink: `[@${data.user.login}](${data.user.html_url})`,
          }
          : undefined,
      commit:
        mergeCommitSha !== undefined && mergeCommitUrl !== undefined
          ? {
            sha: mergeCommitSha,
            url: mergeCommitUrl,
            markdownLink: `[\`${mergeCommitSha.slice(0, 7)}\`](${mergeCommitUrl})`,
          }
          : undefined,
    }
  })
}
