import process from 'node:process'
import { afterAll, describe, expect, test } from 'vitest'
import { findPullContainingCommit } from '../src/find-pull.js'
import { startMockGitea } from './mock-gitea.js'
import type { Server } from 'node:http'
import type { MockRoute } from './mock-gitea.js'

// PR list returned by the `/pulls` route on every page. Numbers descend as
// the real API does; `merged` and `merge_commit_sha` mirror the API fields.
interface MockPull {
  number: number
  merged: boolean
  merge_commit_sha?: string
}

interface Scenario {
  readonly pulls?: MockPull[]
  readonly commitsByPull?: Record<number, string[]>
  readonly noPullsRoute?: boolean
}

const target = (seed: string): string => seed.padEnd(40, 'a')

const buildRoutes = (scenario: Scenario): MockRoute[] => {
  const routes: MockRoute[] = []
  if (scenario.noPullsRoute !== true) {
    routes.push({
      test: (p) => /^\/api\/v1\/repos\/[^/]+\/[^/]+\/pulls$/u.exec(p),
      handler: (): object | number => scenario.pulls ?? [],
    })
  }
  routes.push({
    test: (p) => /^\/api\/v1\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)\/commits$/u.exec(p),
    handler: (m): object | number => {
      const number = Number(m.groups?.pull)
      const commits = scenario.commitsByPull?.[number]
      if (commits === undefined) {
        return 404
      }
      return commits.map((sha) => ({ sha }))
    },
  })
  return routes
}

const startScenarioServer = async (scenario: Scenario): Promise<Server> => {
  const server = await startMockGitea(buildRoutes(scenario))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Mock Gitea server is not listening on a TCP port')
  }
  process.env.GITEA_SERVER_URL = `http://127.0.0.1:${address.port}`
  process.env.GITEA_TOKEN = 'fake-token'
  return server
}

const servers: Server[] = []

afterAll(() => {
  servers.forEach((server) => {
    server.close()
  })
})

const serverUrl = (server: Server): string => {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Mock Gitea server is not listening on a TCP port')
  }
  return `http://127.0.0.1:${address.port}`
}

const recentPulls: MockPull[] = [
  { number: 6, merged: false },
  { number: 5, merged: true, merge_commit_sha: 'b'.repeat(40) },
  { number: 4, merged: true, merge_commit_sha: 'c'.repeat(40) },
  { number: 3, merged: true, merge_commit_sha: 'd'.repeat(40) },
]

describe('findPullContainingCommit', () => {
  test('finds the merged PR whose commit list contains the commit', async () => {
    const server = await startScenarioServer({
      pulls: recentPulls,
      commitsByPull: { 3: [target('1')], 4: ['x'.repeat(40)], 5: ['y'.repeat(40)] },
    })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('1'),
      }),
    ).resolves.toBe(3)
  })

  test('short-circuits on a matching merge commit', async () => {
    const server = await startScenarioServer({
      pulls: [{ number: 9, merged: true, merge_commit_sha: target('2') }],
      // no commits route needed: the merge commit match decides
    })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('2'),
      }),
    ).resolves.toBe(9)
  })

  test('skips unmerged pull requests', async () => {
    const server = await startScenarioServer({
      pulls: [
        { number: 7, merged: false },
        { number: 6, merged: true, merge_commit_sha: 'b'.repeat(40) },
      ],
      commitsByPull: { 6: [target('3')] },
    })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('3'),
      }),
    ).resolves.toBe(6)
  })

  test('returns null when no PR contains the commit (direct push)', async () => {
    const server = await startScenarioServer({
      pulls: recentPulls,
      commitsByPull: {
        3: ['e'.repeat(40)],
        4: ['f'.repeat(40)],
        5: ['g'.repeat(40)],
      },
    })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('4'),
      }),
    ).resolves.toBeNull()
  })

  test('returns null when the commits route is unavailable', async () => {
    const server = await startScenarioServer({
      pulls: recentPulls,
      // commitsByPull omitted: every commits request 404s
    })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('5'),
      }),
    ).resolves.toBeNull()
  })

  test('returns null when the pulls listing is unavailable', async () => {
    const server = await startScenarioServer({ noPullsRoute: true })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('6'),
      }),
    ).resolves.toBeNull()
  })

  test('returns null when the repository does not exist', async () => {
    const server = await startScenarioServer({ pulls: [] })
    servers.push(server)

    await expect(
      findPullContainingCommit({
        serverUrl: serverUrl(server),
        repo: 'org/repo',
        commit: target('7'),
      }),
    ).resolves.toBeNull()
  })
})
