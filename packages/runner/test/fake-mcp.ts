import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'

export type FakeMcp = {
  url: string
  /** Arguments of every `log_external_calls` call, in order. */
  inputs: unknown[]
  /** The Authorization header of every request. */
  auth: string[]
  close(): Promise<void>
}

async function body(req: IncomingMessage): Promise<unknown> {
  let text = ''
  for await (const chunk of req) text += chunk
  return text ? JSON.parse(text) : undefined
}

/**
 * A small MCP server over streamable HTTP (the same SDK the real server uses). `withTool: false` is the server as it
 * is today, before `log_external_calls` exists: calling it is an error. `isError: true` makes the tool answer with an error.
 */
export async function startFakeMcp(opts: { withTool: boolean; token?: string; isError?: boolean }): Promise<FakeMcp> {
  const inputs: unknown[] = []
  const auth: string[] = []
  const http: HttpServer = createServer(async (req, res) => {
    auth.push(String(req.headers.authorization ?? ''))
    if (opts.token && req.headers.authorization !== `Bearer ${opts.token}`) {
      res.writeHead(401).end('Unauthorized')
      return
    }
    const server = new Server({ name: 'fake-jemma', version: '0.0.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: opts.withTool ? [{ name: 'log_external_calls', description: 'fake', inputSchema: { type: 'object' as const } }] : [],
    }))
    server.setRequestHandler(CallToolRequestSchema, async (call) => {
      if (!opts.withTool || call.params.name !== 'log_external_calls') {
        throw new McpError(ErrorCode.InvalidParams, `Tool ${call.params.name} not found`)
      }
      inputs.push(call.params.arguments)
      if (opts.isError) return { isError: true, content: [{ type: 'text' as const, text: 'rejected' }] }
      const logged = ((call.params.arguments as { calls?: unknown[] } | undefined)?.calls ?? []).length
      return { content: [{ type: 'text' as const, text: JSON.stringify({ logged }) }], structuredContent: { logged } }
    })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, await body(req))
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const { port } = http.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    inputs,
    auth,
    close: () => new Promise<void>((resolve) => http.close(() => resolve())),
  }
}
