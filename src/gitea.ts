import createClient from 'openapi-fetch'
import { ENV } from '@/env'
import { isFullString, normalizeServerUrl } from '@/helper'
import type { Client } from 'openapi-fetch'
import type { paths } from '@/generated/gitea-schema'

export class GiteaRequestError extends Error {
  public readonly status: number

  public constructor(status: number, message: string) {
    super(message)
    this.name = 'GiteaRequestError'
    this.status = status
  }
}

export const isNotFound = (error: unknown): boolean => typeof error === 'object'
  && error !== null
  && 'status' in error
  && error.status === 404

/**
 * The generated client types every response as `{ data, error, response }`,
 * even though the configured `fetch` throws on non-2xx responses. This helper
 * returns the response payload, so callers can narrow the union type.
 */
export const getData = <T extends { data?: unknown }>(result: T): NonNullable<T['data']> => {
  const data = result.data
  if (data === undefined) {
    throw new Error('Gitea API request failed without response data')
  }
  // eslint-disable-next-line ts/no-unsafe-type-assertion -- only reached when `data` is defined
  return data as unknown as NonNullable<T['data']>
}

const sleep = async (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const RATE_LIMIT_RETRIES = 2

const isRateLimitResponse = (response: Response): boolean => response.status === 429

const getErrorMessage = (errorBody: string): string | undefined => {
  try {
    const parsed = JSON.parse(errorBody) as unknown
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      const message = (parsed as { message: unknown }).message
      if (typeof message === 'string' && message !== '') {
        return message
      }
    }
  } catch {
    // ignore unparseable error bodies
  }
  return undefined
}

/**
 * The generated client never throws on non-2xx responses, it returns
 * `{ data, error, response }` instead. To keep the request/response semantics
 * of the previous SDK (throwing on errors), the custom fetch below:
 *
 * 1. retries requests that are rate limited (HTTP 429) a few times,
 * 2. throws a `GiteaRequestError` for any other non-2xx response.
 */
const fetchWithRateLimitRetry = async (input: Request): Promise<Response> => {
  const attempt = async (retryCount: number): Promise<Response> => {
    const response = await fetch(input.clone())
    if (isRateLimitResponse(response) && retryCount < RATE_LIMIT_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after')) || 1

      await sleep(retryAfter * 1_000)

      return attempt(retryCount + 1)
    }
    return response
  }

  const response = await attempt(0)
  if (response.ok) {
    return response
  }

  const status = response.status
  const errorBody = await response.text().catch(() => undefined)
  const message = errorBody === undefined
    ? undefined
    : getErrorMessage(errorBody)
  throw new GiteaRequestError(
    status,
    message ?? `Gitea API request failed with status ${status}`,
  )
}

export const setupGitea = (serverUrl: string, token: string): Client<paths> => createClient<paths>({
  // The Gitea REST API lives under `/api/v1`; the previous SDK appended this
  // prefix automatically.
  baseUrl: `${normalizeServerUrl(serverUrl)}/api/v1`,
  headers: {
    Authorization: `token ${token}`,
  },
  fetch: fetchWithRateLimitRetry,
})

export const getGiteaClient = (
  serverUrl: string | undefined,
): { gitea: Client<paths>; serverUrl: string } => {
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
    gitea: setupGitea(resolvedServerUrl, GITEA_TOKEN),
    serverUrl: normalizeServerUrl(resolvedServerUrl),
  }
}

export type GiteaClient = ReturnType<typeof setupGitea>
