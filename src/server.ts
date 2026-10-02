import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { appDb } from './database/db.js';
import { ConnectorError } from './domain/errors.js';
import { ConnectionConfig, ConnectionTestSchema } from './domain/types.js';
import { rootLogger } from './logging/logger.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './mcp/server.js';
import { executeMcpTool, MCP_TOOLS } from './mcp/tools.js';
import { DemoProvider } from './providers/demo.provider.js';
import { MerchantDataProvider } from './providers/provider.interface.js';
import { WooCommerceProvider } from './providers/woocommerce.provider.js';
import { validateStoreUrl } from './security/ssrf.js';
import { agentService } from './services/agent.service.js';
import { attentionEngine } from './services/attention.service.js';
import { webhookHandler } from './webhooks/webhook.handler.js';

dotenv.config();

export function createApp(initialProvider?: MerchantDataProvider) {
  const app = express();

  // Active provider reference (default to DemoProvider or initialized WooCommerceProvider)
  let activeProvider: MerchantDataProvider =
    initialProvider ||
    (process.env.WOOCOMMERCE_STORE_URL && process.env.WOOCOMMERCE_CONSUMER_KEY && process.env.DEMO_MODE !== 'true'
      ? new WooCommerceProvider({
          storeUrl: process.env.WOOCOMMERCE_STORE_URL,
          consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
          consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || '',
        })
      : new DemoProvider());

  // Middlewares
  app.use(cors());

  // Capture raw body for webhook HMAC validation
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Request ID & Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    res.setHeader('x-request-id', requestId);
    (req as any).requestId = requestId;
    next();
  });

  // 1. Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      service: 'merchantops-connector',
      environment: activeProvider.mode,
      provider: activeProvider.name,
      readOnly: true,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Connection Status & Configuration
  app.get('/api/connection', async (_req: Request, res: Response) => {
    const saved = appDb.getSavedConnection();
    const status = await activeProvider.testConnection().catch((err) => ({
      connected: false,
      store: 'Unknown',
      storeUrl: saved?.storeUrl || '',
      mode: activeProvider.mode,
      permissions: [],
      apiVersion: 'wc/v3',
      accessibleResources: { orders: false, products: false, inventory: false },
      checkedAt: new Date().toISOString(),
      error: (err as Error).message,
    }));

    res.json({
      activeMode: activeProvider.mode,
      providerName: activeProvider.name,
      savedConfig: saved ? { storeUrl: saved.storeUrl, consumerKeyPrefix: saved.consumerKeyPrefix } : null,
      status,
    });
  });

  // 3. Test & Save Connection
  app.post('/api/connection/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ConnectionTestSchema.parse(req.body);

      if (parsed.isDemo || parsed.storeUrl.includes('demo') || parsed.storeUrl.includes('internal')) {
        activeProvider = new DemoProvider();
        const demoStatus = await activeProvider.testConnection();
        appDb.saveConnection(parsed as ConnectionConfig, demoStatus);
        return res.json(demoStatus);
      }

      // Live WooCommerce validation
      await validateStoreUrl(parsed.storeUrl);
      const testProvider = new WooCommerceProvider({
        storeUrl: parsed.storeUrl,
        consumerKey: parsed.consumerKey,
        consumerSecret: parsed.consumerSecret,
      });

      const liveStatus = await testProvider.testConnection();
      activeProvider = testProvider;
      appDb.saveConnection(parsed as ConnectionConfig, liveStatus);

      res.json(liveStatus);
    } catch (err) {
      next(err);
    }
  });

  // Switch between Demo and Live
  app.post('/api/connection/mode', (req: Request, res: Response) => {
    const { mode } = req.body;
    if (mode === 'demo') {
      activeProvider = new DemoProvider();
      return res.json({ mode: 'demo', provider: activeProvider.name });
    } else if (process.env.WOOCOMMERCE_STORE_URL) {
      activeProvider = new WooCommerceProvider({
        storeUrl: process.env.WOOCOMMERCE_STORE_URL,
        consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY || '',
        consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || '',
      });
      return res.json({ mode: 'live', provider: activeProvider.name });
    }
    return res.status(400).json({ error: 'No live WooCommerce credentials configured in environment.' });
  });

  // 4. Orders API
  app.get('/api/orders', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        status: req.query.status as string,
        customer: req.query.customer as string,
        orderId: req.query.orderId as string,
        product: req.query.product as string,
        sku: req.query.sku as string,
        after: req.query.after as string,
        before: req.query.before as string,
        minTotal: req.query.minTotal ? Number(req.query.minTotal) : undefined,
        maxTotal: req.query.maxTotal ? Number(req.query.maxTotal) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      };

      const result = await activeProvider.searchOrders(filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await activeProvider.getOrder(String(req.params.id));
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  // 5. Products API
  app.get('/api/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        query: req.query.query as string,
        sku: req.query.sku as string,
        stockStatus: req.query.stockStatus as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      };

      const result = await activeProvider.searchProducts(filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/products/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await activeProvider.getProduct({ productId: String(req.params.id) });
      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  // 6. Attention Queue API
  app.get('/api/attention', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const minPriority = req.query.minPriority as any;
      const result = await attentionEngine.findOrdersNeedingAttention(activeProvider, limit, minPriority);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 7. Agent Operations Chat API
  app.post('/api/agent/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message field is required.' });
      }

      const response = await agentService.processQuery(message, activeProvider);
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // 8. MCP Tools Catalog & Execution
  app.get('/api/mcp/tools', (_req: Request, res: Response) => {
    res.json({
      tools: MCP_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        readOnly: t.readOnly,
        permission: t.permission,
        dataSensitivity: t.dataSensitivity,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      })),
    });
  });

  app.post('/api/mcp/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tool, arguments: args } = req.body;
      if (!tool) {
        return res.status(400).json({ error: 'Field "tool" is required.' });
      }

      const requestId = (req as any).requestId;
      const result = await executeMcpTool(tool, args || {}, activeProvider, requestId);
      res.json({ tool, result, requestId });
    } catch (err) {
      next(err);
    }
  });

  // 8b. Official MCP Protocol over SSE (for Agent Studio & network MCP hosts)
  let sseTransport: SSEServerTransport | null = null;
  app.get('/sse', async (_req: Request, res: Response) => {
    rootLogger.info('Incoming MCP SSE connection from Agent Studio / MCP host');
    sseTransport = new SSEServerTransport('/messages', res);
    const mcpServer = createMcpServer(activeProvider);
    await mcpServer.connect(sseTransport);
  });

  app.post('/messages', async (req: Request, res: Response) => {
    if (sseTransport) {
      await sseTransport.handlePostMessage(req, res);
    } else {
      res.status(400).send('No active SSE session');
    }
  });

  // 9. Webhooks Ingestion
  app.post('/api/webhooks/woocommerce', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const headers = {
        signature: req.headers['x-wc-webhook-signature'] as string,
        topic: req.headers['x-wc-webhook-topic'] as string,
        resource: req.headers['x-wc-webhook-resource'] as string,
        eventId: req.headers['x-wc-webhook-id'] as string,
        source: req.headers['x-wc-webhook-source'] as string,
      };

      const result = webhookHandler.processWebhook(rawBody, headers);
      res.status(result.status === 'DUPLICATE' ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 10. Audit Logs
  app.get('/api/audit', (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const logs = appDb.getAuditLogs(limit);
    res.json({ count: logs.length, logs });
  });

  // 11. Dedicated JSON 404 Handler for Unrecognized /api Routes
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `API endpoint ${req.method} ${req.originalUrl} does not exist.`,
      statusCode: 404,
      remedy: 'Check available endpoints at /api/health or review the MCP tool specification at /api/mcp/tools.',
    });
  });

  // Serve Frontend Static Files in Production if dist exists
  const distPath = path.resolve(process.cwd(), 'frontend', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      if (req.method === 'GET') {
        return res.sendFile(path.resolve(distPath, 'index.html'));
      }
      next();
    });
  }

  // Central Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ConnectorError) {
      return res.status(err.statusCode).json(err.toJSON());
    }

    if (err.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request parameters.',
        details: err.errors,
      });
    }

    rootLogger.error('Unhandled server error', { error: String(err), stack: err.stack });
    res.status(500).json({
      error: 'UNKNOWN_ERROR',
      message: err.message || 'An unexpected internal error occurred.',
    });
  });

  return app;
}

export function startServer(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  const server = app.listen(port, () => {
    rootLogger.info(`MerchantOps Connector server listening on port ${port}`);
    console.log(`\n======================================================`);
    console.log(`🚀 MerchantOps Connector running on http://localhost:${port}`);
    console.log(`🛡️  Read-Only WooCommerce Agent Gateway Active`);
    console.log(`📦 Health endpoint: http://localhost:${port}/api/health`);
    console.log(`⚡ MCP Tools: http://localhost:${port}/api/mcp/tools`);
    console.log(`======================================================\n`);
  });

  const shutdown = () => {
    rootLogger.info('Shutting down MerchantOps Connector gracefully...');
    server.close(() => {
      appDb.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer();
}
