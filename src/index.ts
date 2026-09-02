import { ENV } from '@/env'
import { findPullContainingCommit } from '@/find-pull'
import { getCommitInfo, getPullRequestInfo } from '@/get-info'
import { isFullString, normalizeServerUrl } from '@/helper'
import { buildReleaseLineTokens, renderTemplate } from '@/render-template'
import type { ChangelogFunctions } from '@changesets/types'

const ISSUE_REF_REGEX = /\[.*?\]\(.*?\)|\B#(?<issue>[1-9]\d*)\b/gu

// "match what you skip, capture what you want": the left alternative
// consumes markdown links so the right alternative only matches bare refs
const linkifyIssueRefs = (
  line: string,
  serverUrl: string,
  repo: string,
): string => line.replaceAll(ISSUE_REF_REGEX, (match, issue) => {
  if (typeof issue !== 'string') {
    return match
  }
  return `[#${issue}](${serverUrl}/${repo}/issues/${issue})`
})

const getServerUrlOrThrow = (options: Record<string, unknown> | null): string => {
  const serverUrl = options?.serverUrl ?? ENV.GITEA_SERVER_URL
  if (!isFullString(serverUrl)) {
    throw new Error(
      'Please provide a server URL to this changelog generator like this:\n"changelog": ["@changesets/changelog-gitea", { "serverUrl": "https://gitea.example.com" }]\nor set the GITEA_SERVER_URL environment variable.',
    )
  }
  return normalizeServerUrl(serverUrl)
}

const getRepoOrThrow = (options: null | Record<string, unknown>): string => {
  const repo = options?.repo ?? ENV.GITEA_REPOSITORY
  if (!isFullString(repo)) {
    throw new Error(
      'Please provide a repo to this changelog generator like this:\n"changelog": ["@changesets/changelog-gitea", { "repo": "org/repo" }]\nor set the GITEA_REPOSITORY environment variable.',
    )
  }
  return repo
}

const changelogFunctions: ChangelogFunctions = {
  getDependencyReleaseLine: async (
    changesets,
    dependenciesUpdated,
    options,
  ) => {
    const serverUrl = getServerUrlOrThrow(options)
    const repo = getRepoOrThrow(options)
    if (dependenciesUpdated.length === 0) {
      return ''
    }

    const commitLinks = await Promise.all(
      changesets.map(async (cs) => {
        if (cs.commit === undefined) {
          return null
        }
        const info = await getCommitInfo({ serverUrl, repo, commit: cs.commit })
        return info?.commit.markdownLink ?? `\`${cs.commit.slice(0, 7)}\``
      }),
    )

    const changesetLink = `- Updated dependencies [${commitLinks
      .filter((link) => link !== null)
      .join(', ')}]:`

    const updatedDepenenciesList = dependenciesUpdated.map(
      (dependency) => `  - ${dependency.name}@${dependency.newVersion}`,
    )

    return [changesetLink, ...updatedDepenenciesList].join('\n')
  },
  getReleaseLine: async (changeset, type, options) => {
    const serverUrl = getServerUrlOrThrow(options)
    const repo = getRepoOrThrow(options)

    const parsed: {
      prFromSummary: number | null
      commitFromSummary: string | null
      usersFromSummary: string[]
    } = {
      prFromSummary: null,
      commitFromSummary: null,
      usersFromSummary: [],
    }

    const replacedChangelog = changeset.summary
      .replace(/^\s*(?:pr|pull|pull\s+request):\s*#?(?<pr>\d+)/imu, (_, pr) => {
        const num = Number(pr)
        if (!Number.isNaN(num)) {
          parsed.prFromSummary = num
        }
        return ''
      })
      .replace(/^\s*commit:\s*(?<commit>\S+)/imu, (_, commit) => {
        parsed.commitFromSummary = String(commit)
        return ''
      })
      .replaceAll(/^\s*(?:author|user):\s*@?(?<user>\S+)/gimu, (_, user) => {
        parsed.usersFromSummary.push(String(user))
        return ''
      })
      .trim()

    const [firstLine = '', ...futureLines] = replacedChangelog
      .split('\n')
      .map((l) => l.trimEnd())

    const links: { pull?: string; commit?: string; user?: string } = {}

    if (parsed.prFromSummary === null) {
      const commitToFetchFrom = parsed.commitFromSummary ?? changeset.commit
      if (commitToFetchFrom !== undefined) {
        const info = await getCommitInfo({ serverUrl, repo, commit: commitToFetchFrom })

        // On Gitea only merge commits are linked to their pull request, while
        // Changesets reports the commit that *added* the changeset. For a
        // change merged through a pull request that commit lives on the
        // feature branch and carries no PR association, so recover the PR by
        // scanning the repository's merged pull requests for the one whose
        // commit list contains it.
        const resolvedPull = parsed.commitFromSummary === null && info?.pull === undefined
          ? await findPullContainingCommit({ serverUrl, repo, commit: commitToFetchFrom })
          : null

        const pullInfo = resolvedPull === null
          ? null
          : await getPullRequestInfo({ serverUrl, repo, pull: resolvedPull })

        // The lookup carrying the PR also carries the PR opener's account,
        // which is the author to thank; the commit link stays on the
        // changeset's own commit when it resolved.
        const prCarryingInfo = pullInfo?.pull === undefined ? info : pullInfo
        links.pull = prCarryingInfo?.pull?.markdownLink
        links.commit = (info?.commit ?? pullInfo?.commit)?.markdownLink
        links.user = prCarryingInfo?.author?.markdownLink ?? info?.author?.markdownLink
      }
    } else {
      const info = await getPullRequestInfo({ serverUrl, repo, pull: parsed.prFromSummary })
      links.pull = info?.pull.markdownLink
      links.commit = info?.commit?.markdownLink
      links.user = info?.author?.markdownLink

      if (parsed.commitFromSummary !== null) {
        const url = `${serverUrl}/${repo}/commit/${parsed.commitFromSummary}`
        links.commit = `[\`${parsed.commitFromSummary.slice(0, 7)}\`](${url})`
      }
    }

    const thanksFromSummary = parsed.usersFromSummary.length > 0
      ? parsed.usersFromSummary
        .map(
          (userFromSummary) => `[@${userFromSummary}](${serverUrl}/${userFromSummary})`,
        )
        .join(', ')
      : links.user

    const users = options?.disableThanks === true ? null : thanksFromSummary

    const summaryLinked = linkifyIssueRefs(firstLine, serverUrl, repo)

    const continuation = futureLines
      .map((l) => `  ${linkifyIssueRefs(l, serverUrl, repo)}`)
      .join('\n')

    if (isFullString(options?.template)) {
      const tokens = buildReleaseLineTokens({
        summaryLinked,
        links,
        users,
      })
      // trimEnd so an empty trailing token (e.g. `{ref}` with no PR/commit)
      // leaves no dangling space - a trailing space in markdown is unsafe.
      const rendered = renderTemplate(options.template, tokens).trimEnd()
      return `${rendered}\n${continuation}`
    }

    const prefix = [
      typeof links.pull === 'string' ? ` ${links.pull}` : '',
      typeof links.commit === 'string' ? ` ${links.commit}` : '',
      typeof users === 'string' ? ` Thanks ${users}!` : '',
    ].join('')

    return `\n\n-${prefix === '' ? '' : `${prefix} -`} ${summaryLinked}\n${continuation}`
  },
}

// ChangelogFunctions require a default export
// eslint-disable-next-line import/no-default-export
export default changelogFunctions
