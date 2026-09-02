import { splitRepo } from '@/get-info'
import { getData, getGiteaClient, isNotFound } from '@/gitea'
import type { GiteaClient } from '@/gitea'

export interface FindPullContainingCommitOptions {
  readonly serverUrl?: string
  readonly repo: string
  readonly commit: string
}

/**
 * Merged pull requests are only scanned this far before giving up. Release
 * changesets concern the PRs merged since the last release, so the newest
 * pages cover the common case; scanning a busy repository's full history
 * would be unbounded.
 */
const MAX_PULLS_TO_SCAN = 60

const PAGE_SIZE = 50

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

const pullContainingCache = new Map<string, Promise<number | null>>()

const pullContainsCommit = async (
  gitea: GiteaClient,
  owner: string,
  repo: string,
  pullNumber: number,
  commit: string,
  page = 1,
): Promise<boolean> => {
  const response = await gitea.GET('/repos/{owner}/{repo}/pulls/{index}/commits', {
    params: {
      path: { owner, repo, index: pullNumber },
      query: { page, limit: PAGE_SIZE },
    },
  }).catch((error: unknown) => {
    if (isNotFound(error)) {
      return
    }
    throw error
  })
  if (response === undefined) {
    return false
  }

  const commits = getData(response)
  if (commits.some((item) => item.sha === commit)) {
    return true
  }
  if (commits.length < PAGE_SIZE) {
    return false
  }

  return pullContainsCommit(gitea, owner, repo, pullNumber, commit, page + 1)
}

const scanPullsPage = async (
  gitea: GiteaClient,
  owner: string,
  repo: string,
  commit: string,
  page: number,
  scanned: number,
): Promise<number | null> => {
  const pullsResponse = await gitea.GET('/repos/{owner}/{repo}/pulls', {
    params: {
      path: { owner, repo },
      query: { state: 'all', page, limit: PAGE_SIZE },
    },
  }).catch((error: unknown) => {
    if (isNotFound(error)) {
      return
    }
    throw error
  })
  if (pullsResponse === undefined) {
    return null
  }

  const pulls = getData(pullsResponse)
  if (pulls.length === 0) {
    return null
  }

  const merged = pulls.filter((pull) => pull.merged === true)
  const scannedTotal = scanned + merged.length
  if (scannedTotal > MAX_PULLS_TO_SCAN) {
    return null
  }

  // fast path: the changeset commit *is* this PR's merge commit
  const mergeCommitMatch = merged.find(
    (pull) => pull.merge_commit_sha === commit,
  )
  if (mergeCommitMatch !== undefined) {
    return mergeCommitMatch.number ?? null
  }

  const found = await Promise.all(
    merged.map(async (pull): Promise<number | null> => {
      if (pull.number === undefined) {
        return null
      }
      const contains = await pullContainsCommit(
        gitea,
        owner,
        repo,
        pull.number,
        commit,
      )
      return contains ? pull.number : null
    }),
  )
  const containing = found.find((entry) => entry !== null)

  if (containing !== undefined) {
    return containing
  }

  if (pulls.length < PAGE_SIZE) {
    return null
  }

  return scanPullsPage(gitea, owner, repo, commit, page + 1, scannedTotal)
}

/**
 * Find the merged pull request whose commit list contains `commit`, or
 * `null` when there is none.
 *
 * A commit belongs to at most one merged pull request: the one that merged
 * it. Commits merged via squash are additionally linked through their merge
 * commit, but feature-branch commits of merge-commit merges only show up in
 * the PR's commit list, which is what this lookup exploits. Commits pushed
 * directly to the base branch appear in no pull request.
 */
export const findPullContainingCommit = async (
  options: FindPullContainingCommitOptions,
): Promise<number | null> => {
  return loadCached<number | null>(
    pullContainingCache,
    `pull:${options.repo}:${options.commit}`,
    async () => {
      const { gitea } = getGiteaClient(options.serverUrl)
      const [owner, repo] = splitRepo(options.repo)

      return scanPullsPage(gitea, owner, repo, options.commit, 1, 0)
    },
  )
}
