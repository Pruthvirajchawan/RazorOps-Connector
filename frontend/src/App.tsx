import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Box,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Layers,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap
} from 'lucide-react';

interface AttentionEvidence {
  source: string;
  metric: string;
  value: string | number;
  thresholdOrExpected?: string | number;
  explanation: string;
}

interface AttentionItem {
  id: string;
  orderId: string;
  orderNumber: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  total: string;
  currency: string;
  reason: string;
  potentialImpact: string;
  affectedSkus: string[];
  evidence: AttentionEvidence[];
  detectedAt: string;
}

interface ActivityStep {
  id: string;
  step: string;
  title: string;
  toolName?: string;
  input?: Record<string, unknown>;
  outputSnippet?: string;
  latencyMs?: number;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  timestamp: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  toolCallsMade?: string[];
  attentionItems?: AttentionItem[];
  activities?: ActivityStep[];
  requestId?: string;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  requestId: string;
  toolName: string;
  inputSummary: string;
  storeUrl: string;
  endpointCategory: string;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR';
  errorCode?: string;
  resultCount?: number;
}

const PRESET_PROMPTS = [
  'What orders need my attention today?',
  'Find orders affected by SKU-483',
  'Show highest-value pending order',
  'Find products that are running low on stock',
  'Get order #10482',
  'Which orders are currently processing?',
];

export default function App() {
  // Connection state
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [storeUrl, setStoreUrl] = useState('https://demo-store.razorops.internal');
  const [consumerKey, setConsumerKey] = useState('ck_demo_fde_read_access_verified');
  const [consumerSecret, setConsumerSecret] = useState('cs_demo_fde_secret_bound_read_only');
  const [showSecret, setShowSecret] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState({
    store: 'Apex Retail India (Synthetic Store)',
    mode: 'demo',
    permissions: ['read_orders', 'read_products', 'read_inventory'],
    ordersAccessible: true,
    productsAccessible: true,
    inventoryAccessible: true,
  });
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connMessage, setConnMessage] = useState<string | null>(null);

  // Chat & Agent state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'agent',
      text: "👋 **Welcome to MerchantOps Connector.** I am your bounded operational operations agent for WooCommerce.\n\nI can retrieve, correlate, and reason over merchant orders and inventory to identify operational risks and fulfillments bottlenecks with verifiable ground-truth evidence.\n\n*Try asking one of the operational queries below:*",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Activity Inspector state
  const [selectedActivities, setSelectedActivities] = useState<ActivityStep[]>([]);
  const [selectedAttentionItem, setSelectedAttentionItem] = useState<AttentionItem | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'trace' | 'evidence' | 'mcp'>('trace');

  // Audit modal
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Initial connection check
  useEffect(() => {
    fetch('/api/connection')
      .then((res) => res.json())
      .then((data) => {
        if (data.status?.connected) {
          setIsConnected(true);
          setConnectionDetails({
            store: data.status.store,
            mode: data.status.mode,
            permissions: data.status.permissions,
            ordersAccessible: data.status.accessibleResources?.orders ?? true,
            productsAccessible: data.status.accessibleResources?.products ?? true,
            inventoryAccessible: data.status.accessibleResources?.inventory ?? true,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setConnMessage(null);
    try {
      const res = await fetch('/api/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeUrl,
          consumerKey,
          consumerSecret,
          isDemo: mode === 'demo',
        }),
      });

      const data = await res.json();
      if (res.ok && data.connected) {
        setIsConnected(true);
        setConnectionDetails({
          store: data.store,
          mode: data.mode,
          permissions: data.permissions,
          ordersAccessible: data.accessibleResources?.orders,
          productsAccessible: data.accessibleResources?.products,
          inventoryAccessible: data.accessibleResources?.inventory,
        });
        setConnMessage('✓ Connection verified. Read boundaries established.');
      } else {
        setIsConnected(false);
        setConnMessage(`✕ Failed: ${data.message || 'Connection refused'}`);
      }
    } catch (err: any) {
      setIsConnected(false);
      setConnMessage(`✕ Network error: ${err.message}`);
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleModeSwitch = (newMode: 'demo' | 'live') => {
    setMode(newMode);
    if (newMode === 'demo') {
      setStoreUrl('https://demo-store.razorops.internal');
      setConsumerKey('ck_demo_fde_read_access_verified');
      setConsumerSecret('cs_demo_fde_secret_bound_read_only');
      fetch('/api/connection/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'demo' }),
      }).then(() => handleTestConnection());
    } else {
      setStoreUrl('https://your-store.com');
      setConsumerKey('');
      setConsumerSecret('');
      setIsConnected(false);
      setConnMessage('Enter your WooCommerce REST API credentials.');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isThinking) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsThinking(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });

      const data = await res.json();

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: data.answer || 'Completed inquiry.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolCallsMade: data.toolCallsMade || [],
        attentionItems: data.attentionItems || [],
        activities: data.activities || [],
        requestId: data.requestId,
      };

      setMessages((prev) => [...prev, agentMsg]);
      if (data.activities && data.activities.length > 0) {
        setSelectedActivities(data.activities);
      }
      if (data.attentionItems && data.attentionItems.length > 0) {
        setSelectedAttentionItem(data.attentionItems[0]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-err-${Date.now()}`,
          sender: 'agent',
          text: `⚠️ **Connector Error:** Failed to execute agent operational flow: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit?limit=25');
      const data = await res.json();
      setAuditLogs(data.logs || []);
      setShowAuditModal(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#070b14] text-slate-200 overflow-hidden font-sans">
      {/* ───────────────────────────────────────────────────────────
          COLUMN 1: CONNECTION & POLICY CONTROLS (LEFT - 280px)
         ─────────────────────────────────────────────────────────── */}
      <aside className="w-80 border-r border-slate-800/80 bg-[#0b101d] flex flex-col justify-between shrink-0 select-none">
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Logo / Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-sm shadow-inner">
                MO
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-wide text-white">MerchantOps</h1>
                <p className="text-[11px] text-slate-400 font-mono">WooCommerce Gateway</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-tight bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              v1.0 FDE
            </span>
          </div>

          {/* Mode Switcher */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 block mb-1.5">
              Operational Mode
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 rounded-md border border-slate-800">
              <button
                type="button"
                onClick={() => handleModeSwitch('demo')}
                className={`py-1.5 text-xs font-medium rounded transition-all ${
                  mode === 'demo'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Demo (Synthetic)
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('live')}
                className={`py-1.5 text-xs font-medium rounded transition-all ${
                  mode === 'live'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Live Store
              </button>
            </div>
          </div>

          {/* Credentials Form */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-[11px] text-slate-400 font-medium block mb-1">Store URL</label>
              <input
                type="text"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://store.example.com"
                className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 font-medium block mb-1">Consumer Key</label>
              <input
                type="text"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                placeholder="ck_********************"
                className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] text-slate-400 font-medium">Consumer Secret</label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
                >
                  {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showSecret ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <input
                type={showSecret ? 'text' : 'password'}
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="cs_********************"
                className="w-full bg-slate-900/80 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTestingConn}
              className="w-full mt-2 py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 rounded font-medium text-xs flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingConn ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isTestingConn ? 'Validating Upstream...' : 'TEST CONNECTION'}</span>
            </button>

            {connMessage && (
              <p
                className={`text-[11px] mt-1 px-2 py-1.5 rounded border leading-tight ${
                  connMessage.startsWith('✓')
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {connMessage}
              </p>
            )}
          </div>

          {/* Connection Verification Checklist */}
          <div className="pt-2 border-t border-slate-800/70 space-y-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Access & Boundary Status
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Connection Status
                </span>
                <span className="font-mono text-emerald-400 text-[11px] font-medium">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Read-Only Policy
                </span>
                <span className="font-mono text-indigo-400 text-[11px] font-semibold">ENFORCED</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-300" />
                  Orders
                </span>
                <span className="font-mono text-emerald-400 text-[11px]">✓ Accessible</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-slate-300" />
                  Products
                </span>
                <span className="font-mono text-emerald-400 text-[11px]">✓ Accessible</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-300" />
                  Inventory Snapshot
                </span>
                <span className="font-mono text-emerald-400 text-[11px]">✓ Accessible</span>
              </div>
            </div>

            {/* Read-Only Guarantee Box */}
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed flex gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Read-Only Guardrail:</strong> Order mutations, refunds, payment actions, and deletions are strictly blocked at the protocol level.
              </span>
            </div>
          </div>
        </div>

        {/* Footer controls: Audit logs & health */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={fetchAuditLogs}
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Audit Trail</span>
          </button>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Gateway Ready</span>
          </div>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────
          COLUMN 2: AGENT CONVERSATION & OPERATIONS DESK (CENTER)
         ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col bg-[#070b14] min-w-0 border-r border-slate-800/80">
        {/* Top Navbar */}
        <header className="h-14 border-b border-slate-800/80 bg-[#090e1a] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
                Merchant Operations Agent
              </h2>
              <p className="text-[11px] text-slate-400">
                Reasoning over <span className="text-indigo-400 font-medium">{connectionDetails.store}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
              MCP Tools: 6 Registered
            </span>
            <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/50">
              Deterministic Logic
            </span>
          </div>
        </header>

        {/* Preset Prompt Pills */}
        <div className="p-3 border-b border-slate-800/60 bg-slate-950/40 flex items-center gap-2 overflow-x-auto select-none no-scrollbar">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" /> Queries:
          </span>
          {PRESET_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-xs shrink-0 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-indigo-950/60 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 transition-all font-sans"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl p-4 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white font-medium shadow-md'
                    : 'bg-[#0f172a] border border-slate-800 text-slate-200 shadow-sm'
                }`}
              >
                {/* Header for agent responses */}
                {msg.sender === 'agent' && (
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-semibold text-[11px] text-indigo-300 uppercase tracking-wide">
                        Agent Studio Connector
                      </span>
                    </div>
                    {msg.toolCallsMade && msg.toolCallsMade.length > 0 && (
                      <div className="flex items-center gap-1">
                        {msg.toolCallsMade.map((tool, i) => (
                          <span
                            key={i}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/40 text-indigo-300"
                          >
                            ⚡ {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message body with Markdown style rendering */}
                <div className="space-y-2 whitespace-pre-wrap font-sans text-xs">
                  {msg.text.split('\n\n').map((paragraph, pIdx) => {
                    if (paragraph.startsWith('### ')) {
                      return (
                        <h3 key={pIdx} className="text-sm font-bold text-white mt-3 mb-1 border-b border-slate-800 pb-1">
                          {paragraph.replace('### ', '')}
                        </h3>
                      );
                    }
                    if (paragraph.startsWith('#### ')) {
                      return (
                        <h4 key={pIdx} className="text-xs font-bold text-amber-300 mt-2 mb-0.5">
                          {paragraph.replace('#### ', '')}
                        </h4>
                      );
                    }
                    return (
                      <p key={pIdx} className="text-slate-300 leading-relaxed">
                        {paragraph}
                      </p>
                    );
                  })}
                </div>

                {/* Attention Cards Preview if present */}
                {msg.attentionItems && msg.attentionItems.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Operational Attention Queue ({msg.attentionItems.length} issues)</span>
                      <span className="text-[10px] text-indigo-400">Click to inspect evidence</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {msg.attentionItems.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedAttentionItem(item);
                            setActiveInspectorTab('evidence');
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                            selectedAttentionItem?.id === item.id
                              ? 'bg-slate-800/90 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  item.priority === 'critical'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                    : item.priority === 'high'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                                }`}
                              >
                                {item.priority}
                              </span>
                              <span className="font-mono font-semibold text-white">
                                Order #{item.orderNumber}
                              </span>
                              <span className="text-slate-400 font-mono">({item.total})</span>
                            </div>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {item.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 line-clamp-1">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
            </div>
          ))}

          {isThinking && (
            <div className="flex items-start space-x-2">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Agent executing MCP tools & cross-checking inventory...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800/80 bg-[#090e1a]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about orders, inventory, or operational attention signals..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-3.5 pr-10 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
              />
              <span className="absolute right-3 top-2.5 text-[10px] text-slate-500 font-mono">
                ↵ Enter
              </span>
            </div>
            <button
              type="submit"
              disabled={!inputQuery.trim() || isThinking}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* ───────────────────────────────────────────────────────────
          COLUMN 3: ACTIVITY TRACE & EVIDENCE INSPECTOR (RIGHT - 360px)
         ─────────────────────────────────────────────────────────── */}
      <aside className="w-96 border-l border-slate-800/80 bg-[#0b101d] flex flex-col shrink-0 select-none">
        {/* Inspector Header & Tabs */}
        <div className="p-3 border-b border-slate-800/80 bg-[#090e1a]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Inspector</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              Evidence Engine
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-900/90 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveInspectorTab('trace')}
              className={`py-1 text-[11px] font-medium rounded transition-all ${
                activeInspectorTab === 'trace'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Execution Trace
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab('evidence')}
              className={`py-1 text-[11px] font-medium rounded transition-all ${
                activeInspectorTab === 'evidence'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Evidence Item
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab('mcp')}
              className={`py-1 text-[11px] font-medium rounded transition-all ${
                activeInspectorTab === 'mcp'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MCP Catalog
            </button>
          </div>
        </div>

        {/* Inspector Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: Trace */}
          {activeInspectorTab === 'trace' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Agent Lifecycle Trace
              </div>

              {selectedActivities.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  Run an agent operational query to inspect the step-by-step tool invocation trace.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedActivities.map((act, index) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/50 flex items-center justify-center text-[10px] font-mono font-bold">
                            {index + 1}
                          </span>
                          <span className="text-xs font-semibold text-white">{act.title}</span>
                        </div>
                        {act.latencyMs !== undefined && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {act.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {act.toolName && (
                        <div className="flex items-center gap-1 text-[11px] font-mono text-indigo-300">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Tool: {act.toolName}</span>
                        </div>
                      )}

                      {act.input && (
                        <div className="mt-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                            Parameters
                          </span>
                          <pre className="p-1.5 rounded bg-slate-950 border border-slate-850 text-[10px] font-mono text-slate-300 overflow-x-auto">
                            {JSON.stringify(act.input, null, 2)}
                          </pre>
                        </div>
                      )}

                      {act.outputSnippet && (
                        <p className="text-[11px] text-slate-300 pt-1 border-t border-slate-800/60">
                          {act.outputSnippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Evidence Item Inspector */}
          {activeInspectorTab === 'evidence' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Ground-Truth Evidence Drilldown
              </div>

              {!selectedAttentionItem ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  Select an operational issue from the chat to inspect verified evidence.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-white">
                        Order #{selectedAttentionItem.orderNumber}
                      </span>
                      <span className="text-[11px] font-mono text-amber-400 font-semibold">
                        {selectedAttentionItem.total}
                      </span>
                    </div>

                    <div className="pt-2 text-xs space-y-1.5">
                      <p className="text-slate-300">
                        <strong className="text-slate-200">Flag Reason:</strong> {selectedAttentionItem.reason}
                      </p>
                      <p className="text-amber-300/90 bg-amber-500/10 p-2 rounded border border-amber-500/20 text-[11px]">
                        <strong>Impact:</strong> {selectedAttentionItem.potentialImpact}
                      </p>
                    </div>
                  </div>

                  {/* Evidence Cards */}
                  <div className="space-y-2">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                      Verified Upstream Evidence Chain ({selectedAttentionItem.evidence.length})
                    </span>

                    {selectedAttentionItem.evidence.map((ev, eIdx) => (
                      <div
                        key={eIdx}
                        className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-indigo-300">{ev.metric}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                            {ev.source}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 py-1 text-xs font-mono">
                          <div className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-slate-200">
                            Observed: <strong className="text-emerald-400">{String(ev.value)}</strong>
                          </div>
                          {ev.thresholdOrExpected !== undefined && (
                            <div className="bg-slate-950 px-2 py-1 rounded border border-slate-800 text-slate-400 text-[11px]">
                              Expected: {String(ev.thresholdOrExpected)}
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 italic pt-1">{ev.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MCP Catalog */}
          {activeInspectorTab === 'mcp' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Registered MCP Tool Primitives
              </div>

              <div className="space-y-2 text-xs">
                {[
                  {
                    name: 'search_orders',
                    perm: 'READ_ORDERS',
                    desc: 'Bounded order search by status, SKU, customer, or amount.',
                  },
                  {
                    name: 'get_order',
                    perm: 'READ_ORDERS',
                    desc: 'Normalized order retrieval with line items and fulfillment metadata.',
                  },
                  {
                    name: 'search_products',
                    perm: 'READ_PRODUCTS',
                    desc: 'Product catalog search with stock statuses and pricing.',
                  },
                  {
                    name: 'get_product',
                    perm: 'READ_PRODUCTS',
                    desc: 'Individual SKU lookup with inventory snapshots.',
                  },
                  {
                    name: 'find_low_stock_products',
                    perm: 'READ_INVENTORY',
                    desc: 'Filter inventory below threshold quantities.',
                  },
                  {
                    name: 'find_orders_needing_attention',
                    perm: 'READ_OPERATIONS',
                    desc: 'Cross-resource operational reasoning & inventory shortage analysis.',
                  },
                ].map((tool, tIdx) => (
                  <div key={tIdx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-semibold text-indigo-300">
                        {tool.name}
                      </span>
                      <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-400">
                        {tool.perm}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{tool.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────
          AUDIT LOG MODAL
         ─────────────────────────────────────────────────────────── */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#0b101d] border border-slate-800 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Merchant Operations Audit Trail</h3>
                <span className="text-xs text-slate-400 font-mono">({auditLogs.length} events logged)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Request ID</th>
                    <th className="pb-2">MCP Tool</th>
                    <th className="pb-2">Latency</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Input Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/60">
                      <td className="py-2 text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 text-indigo-400">{log.requestId.slice(0, 10)}...</td>
                      <td className="py-2 text-slate-200">{log.toolName}</td>
                      <td className="py-2 text-slate-400">{log.latencyMs}ms</td>
                      <td className="py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400 max-w-xs truncate">{log.inputSummary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
