import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { isWithImages, OutOfScopeError, type ToolContext } from './tools/context'
import { registry } from './tools/registry'

/** An MCP server with every tool in the registry, running against one context. */
export function createJemmaMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: 'jemma', version: '0.0.0' })
  for (const tool of registry) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input, outputSchema: tool.output },
      async (args: unknown) => {
        try {
          const result = await tool.run(ctx, args as never)
          const output = isWithImages(result) ? result.output : result
          const images = isWithImages(result) ? result.images : []
          const content = [
            { type: 'text' as const, text: JSON.stringify(output) },
            ...images.map((img) =>
              img.mimeType.startsWith('image/')
                ? { type: 'image' as const, data: img.data, mimeType: img.mimeType }
                : {
                    type: 'resource' as const,
                    resource: { uri: `jemma://file/${encodeURIComponent(img.mimeType)}`, mimeType: img.mimeType, blob: img.data },
                  },
            ),
          ]
          return { content, structuredContent: output as Record<string, unknown> }
        } catch (err) {
          const message = err instanceof OutOfScopeError ? err.message : err instanceof Error ? err.message : String(err)
          return { isError: true, content: [{ type: 'text' as const, text: message }] }
        }
      },
    )
  }
  return server
}

/** Server and `@ai-sdk/mcp` client joined by a linked in-memory transport pair. */
export async function connectInMemory(ctx: ToolContext): Promise<{ client: MCPClient; close(): Promise<void> }> {
  const server = createJemmaMcpServer(ctx)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = await createMCPClient({ transport: clientSide as never })
  return {
    client,
    async close() {
      await client.close()
      await server.close()
    },
  }
}
