import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { isFullString } from '@/helper'

let fileEnv: Record<string, string | undefined> = {}

const envFilePath = path.resolve(process.cwd(), '.env')

try {
  // eslint-disable-next-line n/no-sync
  fileEnv = parseEnv(readFileSync(envFilePath, 'utf8'))
} catch {
  // empty
}

const getEnv = (key: string): string | null => {
  const value = process.env[key] ?? fileEnv[key]
  return isFullString(value) ? value : null
}

export const ENV = {
  get GITEA_SERVER_URL(): string | null {
    return getEnv('GITEA_SERVER_URL')
  },
  get GITEA_REPOSITORY(): string | null {
    return getEnv('GITEA_REPOSITORY')
  },
  get GITEA_TOKEN(): string | null {
    return getEnv('GITEA_TOKEN')
  },
} as const
