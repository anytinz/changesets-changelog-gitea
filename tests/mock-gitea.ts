import http from 'node:http'
import type { IncomingMessage, Server } from 'node:http'

export const SERVER_URL_BASE = '/api/v1'

export interface MockRoute {
  test: (pathname: string) => RegExpMatchArray | null
  handler: (match: RegExpMatchArray, req: IncomingMessage) => object | number
}

export const startMockGitea = async (routes: MockRoute[]): Promise<Server> => {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      const { pathname } = new URL(req.url ?? '', 'http://localhost')

      const routeMatch = routes
        .map((route) => {
          const match = route.test(pathname)
          return match === null ? undefined : { route, match }
        })
        .find((entry) => entry !== undefined)

      if (routeMatch === undefined) {
        res.writeHead(404)
        res.end(JSON.stringify({ message: 'No route' }))
        return
      }

      const status = routeMatch.route.handler(routeMatch.match, req)
      if (status === 404) {
        res.writeHead(404)
        res.end(JSON.stringify({ message: 'Not Found' }))
      } else {
        res.writeHead(200)
        res.end(JSON.stringify(status))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    })
  })
}
