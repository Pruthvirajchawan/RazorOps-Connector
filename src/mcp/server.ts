import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { rootLogger } from '../logging/logger.js';
import { DemoProvider } from '../providers/demo.provider.js';
import { MerchantDataProvider } from '../providers/provider.interface.js';
import { WooCommerceProvider } from '../providers/woocommerce.provider.js';
import { executeMcpTool, MCP_TOOLS } from './tools.js';

export function createMcpServer(provider: MerchantDataProvider): Server {
  const server = new Server(
    {
      name: 'merchantops-connector',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: `${t.description} [Permission: ${t.permission}, Read-Only: true]`,
        inputSchema: t.inputSchema as Record<string, unknown>,
      })),
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments as Record<string, unknown>) || {};

    try {
      const result = await executeMcpTool(toolName, args, provider);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${errorMsg}`,
          },
        ],
      };
    }
  });

  return server;
}

export async function runMcpStdio() {
  const isDemo = process.env.DEMO_MODE !== 'false';
  let provider: MerchantDataProvider;

  if (isDemo || !process.env.WOOCOMMERCE_STORE_URL) {
    provider = new DemoProvider();
    rootLogger.info('Starting MCP server in DEMO MODE (Synthetic data)');
  } else {
    provider = new WooCommerceProvider({
      storeUrl: process.env.WOOCOMMERCE_STORE_URL,
      consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY || '',
      consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || '',
    });
    rootLogger.info('Starting MCP server in LIVE WooCommerce mode');
  }

  const server = createMcpServer(provider);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  rootLogger.info('MerchantOps MCP Server connected via stdio transport');
}

// If directly invoked via node/tsx
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  runMcpStdio().catch((err) => {
    console.error('Fatal MCP server error:', err);
    process.exit(1);
  });
}
