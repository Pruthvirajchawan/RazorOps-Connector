import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../src/mcp/tools.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { createApp } from '../src/server.js';
import { agentService } from '../src/services/agent.service.js';

describe('MCP TOOLS & AGENT REASONING SUITE', () => {
  const provider = new DemoProvider();
  const app = createApp(provider);

  it('38. should ensure ALL registered MCP tools explicitly declare readOnly: true', () => {
    expect(MCP_TOOLS.length).toBe(6);
    for (const tool of MCP_TOOLS) {
      expect(tool.readOnly).toBe(true);
      expect(tool.name).toBeDefined();
      expect(tool.permission).toMatch(/^READ_/);
    }
  });

  it('39. should list MCP tools via GET /api/mcp/tools endpoint', async () => {
    const res = await request(app).get('/api/mcp/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools).toHaveLength(6);
    const names = res.body.tools.map((t: any) => t.name);
    expect(names).toContain('search_orders');
    expect(names).toContain('get_order');
    expect(names).toContain('search_products');
    expect(names).toContain('get_product');
    expect(names).toContain('find_low_stock_products');
    expect(names).toContain('find_orders_needing_attention');
  });

  it('40. should execute natural language query in agentService and return evidence-backed findings', async () => {
    const response = await agentService.processQuery('What orders need my attention today?', provider);

    expect(response.toolCallsMade).toContain('find_orders_needing_attention');
    expect(response.attentionItems?.length).toBeGreaterThan(0);
    expect(response.activities.length).toBeGreaterThan(0);
    expect(response.answer).toContain('Order #');
    expect(response.answer).toContain('Evidence');

    // Confirm that Order #10482 appears in the answer
    expect(response.answer).toContain('10482');
  });
});
