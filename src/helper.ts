export const isFullString = (payload: unknown): payload is string => {
  return typeof payload === 'string' && payload !== ''
}

export const normalizeServerUrl = (serverUrl: string): string => {
  return serverUrl.replace(/\/+$/u, '')
}
