import process from 'node:process'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import changelogFunctions from '../src/index.js'
import { SERVER_URL_BASE, startMockGitea } from './mock-gitea.js'
import type { Server } from 'node:http'
import type { MockRoute } from './mock-gitea.js'

const routes: MockRoute[] = [
  {
    test: (p) => new RegExp(
      `^${SERVER_URL_BASE}/repos/([^/]+)/([^/]+)/commits/([^/]+)/pull$`,
      'u',
    ).exec(p),
    handler: (m): object | number => {
      const sha = m[3] ?? ''
      return sha.startsWith('nopr')
        ? 404
        : {
          id: 1,
          number: 42,
          title: 'Add cool feature',
          html_url: `${process.env.GITEA_SERVER_URL}/org/repo/pull/42`,
          user: {
            login: 'alice',
            html_url: `${process.env.GITEA_SERVER_URL}/alice`,
          },
          merge_commit_sha: 'm000000000000000000000000000000000000001',
          merged: true,
        }
    },
  },
  {
    test: (p) => new RegExp(
      `^${SERVER_URL_BASE}/repos/([^/]+)/([^/]+)/git/commits/([^/]+)$`,
      'u',
    ).exec(p),
    handler: (m) => ({
      sha: m[3],
      html_url: `${process.env.GITEA_SERVER_URL}/org/repo/commit/${m[3]}`,
      author: {
        login: 'alice',
        html_url: `${process.env.GITEA_SERVER_URL}/alice`,
      },
      commit: {
        message: 'fix: cool bug',
      },
    }),
  },
  {
    test: (p) => new RegExp(
      `^${SERVER_URL_BASE}/repos/([^/]+)/([^/]+)/pulls/(\\d+)$`,
      'u',
    ).exec(p),
    handler: (m) => ({
      id: Number(m[3]),
      number: Number(m[3]),
      title: 'Add cool feature',
      html_url: `${process.env.GITEA_SERVER_URL}/org/repo/pull/${m[3]}`,
      user: {
        login: 'alice',
        html_url: `${process.env.GITEA_SERVER_URL}/alice`,
      },
      merge_commit_sha: 'm00000000000000000000000000000000000000a',
      merged: true,
    }),
  },
]

let server: Server | null = null

beforeAll(async () => {
  const created = await startMockGitea(routes)
  server = created
  const address = created.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Mock Gitea server is not listening on a TCP port')
  }
  process.env.GITEA_SERVER_URL = `http://127.0.0.1:${address.port}`
  process.env.GITEA_TOKEN = 'fake-token'
})

afterAll(() => {
  server?.close()
})

const changeset = (
  summary: string,
  commit?: string,
): {
  id: string
  summary: string
  releases: never[]
  commit: string | undefined
} => ({ id: 'abc', summary, releases: [], commit })

const restoreEnv = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key)
    return
  }
  process.env[key] = value
}

describe('getReleaseLine', () => {
  test('links commit and thanks the commit author', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Fixed a bug', 'abcdef1234567890'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(
      /\[`abcdef1`\]\(\S+\/org\/repo\/commit\/abcdef1234567890\)/u,
    )
    expect(line).toMatch(/\[@alice\]\(\S+\/alice\)/u)
  })

  test('links the merged PR of a commit', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Added a feature', 'prhead0000000000000000000000000000000001'),
      'minor',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(/\[#42\]\(\S+\/org\/repo\/pull\/42\)/u)
    expect(line).toMatch(
      /\[`prhead0`\]\(\S+\/org\/repo\/com{2}it\/prhead0{33}1\)/u,
    )
  })

  test('with commit having no PR falls back to author link', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Tweaked something', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(
      /\[`nopr0{3}`\]\(\S+\/org\/repo\/com{2}it\/nopr0{34}1\)/u,
    )
    expect(line).toMatch(/\[@alice\]\(\S+\/alice\)/u)
  })

  test('honours PR:/commit:/author: summary keywords', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset(
        'PR: #3\ncommit: cccccccccccccccccccccccccccccccccccccccc\nauthor: bob\nAdded stuff',
      ),
      'minor',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(/\[#3\]\(\S+\/org\/repo\/pull\/3\)/u)
    expect(line).toMatch(
      /\[`c{7}`\]\(\S+\/org\/repo\/com{2}it\/c{40}\)/u,
    )
    expect(line).toMatch(/\[@bob\]\(\S+\/bob\)/u)
  })

  test('linkifies issue references in the summary', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Fixes #12 everywhere'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(/Fixes \[#12\]\(\S+\/org\/repo\/issues\/12\)/u)
  })

  test('supports multiple authors via repeated author:/user: keywords', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset(
        'author: @alice\nuser: bob\nDid things',
        'nopr00000000000000000000000000000000001',
      ),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(
      /\[@alice\]\(\S+\/alice\), \[@bob\]\(\S+\/bob\)/u,
    )
  })

  test('does not double-linkify existing markdown links', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset(
        'see [#42](https://example.com/issues/42)',
        'nopr00000000000000000000000000000000001',
      ),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toContain('see [#42](https://example.com/issues/42)')
  })

  test('does not linkify issue-like refs inside link text', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset(
        'see [fix for #99](https://example.com)',
        'nopr00000000000000000000000000000000001',
      ),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toContain('see [fix for #99](https://example.com)')
  })

  test('does not linkify refs preceded by a word character', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('see foo#123', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toContain('foo#123')
  })

  test('does not linkify #0', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('see #0', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toContain('see #0')
  })

  test('linkifies issue ref at the start of a line', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('#42 was fixed', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(
      /\[#42\]\(\S+\/org\/repo\/issues\/42\) was fixed/u,
    )
  })

  test('linkifies issue ref after punctuation', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('fixed (#99)', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(
      /fixed \(\[#99\]\(\S+\/org\/repo\/issues\/99\)\)/u,
    )
  })

  test('linkifies bare refs while leaving existing links untouched', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset(
        'fixes [#1](https://example.com/1) and #2',
        'nopr00000000000000000000000000000000001',
      ),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toContain('fixes [#1](https://example.com/1) and [#2](')
  })

  test('linkifies issue ref followed by punctuation', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('this fixes #42.', 'nopr00000000000000000000000000000000001'),
      'patch',
      { repo: 'org/repo' },
    )
    expect(line).toMatch(/fixes \[#42\]\(\S+\/org\/repo\/issues\/42\)\./u)
  })

  test('with custom template', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Added a feature', 'prhead0000000000000000000000000000000001'),
      'minor',
      { repo: 'org/repo', template: '- {summary} {ref}' },
    )
    expect(line).toMatch(
      /^- Added a feature \(\[#42\]\(\S+\/org\/repo\/pull\/42\)\)\n$/u,
    )
  })

  test('with disableThanks', async () => {
    const line = await changelogFunctions.getReleaseLine(
      changeset('Fixed a bug', 'abcdef1234567890'),
      'patch',
      { repo: 'org/repo', disableThanks: true },
    )
    expect(line).not.toMatch(/Thanks/u)
  })

  test('strips trailing slashes from the serverUrl', async () => {
    const savedUrl = process.env.GITEA_SERVER_URL
    if (savedUrl === undefined) {
      throw new Error('GITEA_SERVER_URL is not set')
    }
    try {
      const line = await changelogFunctions.getReleaseLine(
        changeset(
          'PR: #3\ncommit: cccccccccccccccccccccccccccccccccccccccc\nauthor: bob\nFixes #12 everywhere',
          'prhead0000000000000000000000000000000001',
        ),
        'minor',
        { serverUrl: `${savedUrl}///`, repo: 'org/repo' },
      )
      expect(line).not.toContain(`${savedUrl}//`)
      expect(line).toContain(`[@bob](${savedUrl}/bob)`)
      expect(line).toContain(
        `Fixes [#12](${savedUrl}/org/repo/issues/12)`,
      )
      expect(line).toContain(
        `[\`ccccccc\`](${savedUrl}/org/repo/commit/cccccccccccccccccccccccccccccccccccccccc)`,
      )
    } finally {
      restoreEnv('GITEA_SERVER_URL', savedUrl)
    }
  })

  test('serverUrl option takes precedence over the env variable', async () => {
    const savedUrl = process.env.GITEA_SERVER_URL
    process.env.GITEA_SERVER_URL = 'http://127.0.0.1:1'
    try {
      const line = await changelogFunctions.getReleaseLine(
        changeset(
          'PR: #3\ncommit: cccccccccccccccccccccccccccccccccccccccc\nAdded stuff',
        ),
        'minor',
        { serverUrl: savedUrl, repo: 'org/repo' },
      )
      expect(line).toContain(
        `[\`ccccccc\`](${savedUrl}/org/repo/commit/cccccccccccccccccccccccccccccccccccccccc)`,
      )
    } finally {
      restoreEnv('GITEA_SERVER_URL', savedUrl)
    }
  })

  test('throws when no serverUrl is given', async () => {
    const savedUrl = process.env.GITEA_SERVER_URL
    delete process.env.GITEA_SERVER_URL
    try {
      await expect(
        changelogFunctions.getReleaseLine(
          changeset('x', 'abcdef1234567890'),
          'patch',
          { repo: 'org/repo' },
        ),
      ).rejects.toThrow(/server URL/u)
    } finally {
      restoreEnv('GITEA_SERVER_URL', savedUrl)
    }
  })

  test('throws when no repo is given', async () => {
    delete process.env.GITEA_REPOSITORY
    await expect(
      changelogFunctions.getReleaseLine(changeset('x'), 'patch', null),
    ).rejects.toThrow(/Please provide a repo/u)
  })

  test('uses the env repo when the repo option is absent', async () => {
    const savedRepo = process.env.GITEA_REPOSITORY
    process.env.GITEA_REPOSITORY = 'org/repo'
    try {
      const line = await changelogFunctions.getReleaseLine(
        changeset('Fixed a bug', 'abcdef1234567890'),
        'patch',
        null,
      )
      expect(line).toMatch(
        /\[`abcdef1`\]\(\S+\/org\/repo\/commit\/abcdef1234567890\)/u,
      )
    } finally {
      restoreEnv('GITEA_REPOSITORY', savedRepo)
    }
  })

  test('throws when the repo option is an empty string', async () => {
    delete process.env.GITEA_REPOSITORY
    await expect(
      changelogFunctions.getReleaseLine(
        changeset('x', 'abcdef1234567890'),
        'patch',
        { repo: '' },
      ),
    ).rejects.toThrow(/Please provide a repo/u)
  })
})

describe('getDependencyReleaseLine', () => {
  test('lists updated dependencies', async () => {
    const line = await changelogFunctions.getDependencyReleaseLine(
      [changeset('bump', 'abcdef1234567890')],
      [
        {
          name: 'pkg-a',
          type: 'minor',
          changesets: ['abc'],
          oldVersion: '1.1.0',
          newVersion: '1.2.3',
          packageJson: { name: 'pkg-a', version: '1.1.0' },
          dir: 'packages/pkg-a',
        },
      ],
      { repo: 'org/repo' },
    )
    expect(line).toMatch(/^- Updated dependencies \[\[`abcdef1`\]/u)
    expect(line).toMatch(/ {2}- pkg-a@1\.2\.3/u)
  })
})
