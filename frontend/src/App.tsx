import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  History,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES & SCHEMAS
   ───────────────────────────────────────────────────────────────────────────── */

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
  {
    label: '🚨 Orders Needing Attention',
    query: 'What orders need my attention today?',
    desc: 'Surfaces fulfillment risks & stock shortages',
  },
  {
    label: '📦 Check SKU-483 Shortage',
    query: 'Find orders affected by SKU-483',
    desc: 'Traces demand for deficit inventory',
  },
  {
    label: '💰 Highest-Value Order',
    query: 'Show highest-value pending order',
    desc: 'Identifies revenue at risk',
  },
  {
    label: '⚠️ Low Stock Products',
    query: 'Find products that are running low on stock',
    desc: 'Audits catalog inventory levels',
  },
  {
    label: '🔍 Order #10482 Details',
    query: 'Get order #10482',
    desc: 'Retrieves order with masked PII',
  },
];

export default function App() {
  // Navigation tabs: 'console' (Operations desk), 'attention' (Queue), 'settings' (Credentials), 'audit' (Logs)
  const [activeTab, setActiveTab] = useState<'console' | 'attention' | 'settings' | 'audit'>('console');

  // Connection & Mode
  const [isTestMode, setIsTestMode] = useState<boolean>(true);
  const [storeUrl, setStoreUrl] = useState('https://demo-store.razorops.internal');
  const [consumerKey, setConsumerKey] = useState('ck_demo_fde_read_access_verified');
  const [consumerSecret, setConsumerSecret] = useState('cs_demo_fde_secret_bound_read_only');
  const [showSecret, setShowSecret] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState({
    store: 'Apex Retail India (Synthetic Store)',
    mode: 'demo',
    permissions: ['read_orders', 'read_products', 'read_inventory'],
  });
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connMessage, setConnMessage] = useState<string | null>(null);

  // Attention Queue State
  const [attentionQueue, setAttentionQueue] = useState<AttentionItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);

  // Inspector state
  const [selectedActivities, setSelectedActivities] = useState<ActivityStep[]>([]);
  const [selectedAttentionItem, setSelectedAttentionItem] = useState<AttentionItem | null>(null);
  const [inspectorView, setInspectorView] = useState<'evidence' | 'trace' | 'mcp'>('evidence');

  // Audit records
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);

  // Chat & Agent state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'agent',
      text: "👋 **Welcome to MerchantOps.** I am your bounded operational intelligence assistant for WooCommerce.\n\nI can cross-correlate active orders against real-time warehouse inventory to surface fulfillment bottlenecks with verifiable ground-truth evidence.\n\n*Click one of the quick actions below to inspect live operations:*",
      timestamp: 'Just now',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAttentionQueue = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const res = await fetch('/api/attention');
      const data = await res.json();
      setAttentionQueue(data.items || []);
      if (data.items && data.items.length > 0) {
        setSelectedAttentionItem((prev) => prev || data.items[0]);
      }
    } catch (err) {
      console.error('Failed to load attention items', err);
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/audit?limit=50');
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Load connection and attention items on startup
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
          });
        }
      })
      .catch(() => {});

    loadAttentionQueue();
  }, [loadAttentionQueue]);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab, loadAuditLogs]);

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
          isDemo: isTestMode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.connected) {
        setIsConnected(true);
        setConnectionDetails({
          store: data.store,
          mode: data.mode,
          permissions: data.permissions,
        });
        setConnMessage('✓ Verified: Read-only boundary established. Credentials sanitized.');
      } else {
        setIsConnected(false);
        setConnMessage(`✕ Connection Failed: ${data.message || 'Store unreachable'}`);
      }
    } catch (err: any) {
      setIsConnected(false);
      setConnMessage(`✕ Error: ${err.message}`);
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleToggleTestMode = (checked: boolean) => {
    setIsTestMode(checked);
    if (checked) {
      setStoreUrl('https://demo-store.razorops.internal');
      setConsumerKey('ck_demo_fde_read_access_verified');
      setConsumerSecret('cs_demo_fde_secret_bound_read_only');
      fetch('/api/connection/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'demo' }),
      }).then(() => {
        handleTestConnection();
        loadAttentionQueue();
      });
    } else {
      setStoreUrl('https://your-store.com');
      setConsumerKey('');
      setConsumerSecret('');
      setIsConnected(false);
      setConnMessage('Enter live WooCommerce REST credentials.');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isThinking) return;

    if (activeTab !== 'console') {
      setActiveTab('console');
    }

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
        text: data.answer || 'Query processed.',
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
        setInspectorView('evidence');
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

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8fafc] text-slate-800 font-sans select-none overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────
          1. SLEEK TOP NAVIGATION (Razorpay Clean Obsidian Aesthetic)
         ───────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-[#0a0f1d] border-b border-slate-800 px-6 flex items-center justify-between shrink-0 text-white z-20">
        {/* Brand identity */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 bg-gradient-to-tr from-blue-600 to-sky-400 rounded-lg flex items-center justify-center shadow-md">
              <Zap className="w-4 h-4 text-white fill-current" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                MerchantOps
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-400/30">
                  Agent Studio
                </span>
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab('console')}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'console'
                  ? 'bg-blue-600/30 border border-blue-500/50 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-blue-400" />
              <span>Operations Console</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('attention');
                loadAttentionQueue();
              }}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'attention'
                  ? 'bg-blue-600/30 border border-blue-500/50 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Fulfillment Attention</span>
              {attentionQueue.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {attentionQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-blue-600/30 border border-blue-500/50 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
              <span>WooCommerce Connector</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-blue-600/30 border border-blue-500/50 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Audit Trail</span>
            </button>
          </nav>
        </div>

        {/* Right side status & mode toggle */}
        <div className="flex items-center space-x-4 text-xs">
          {/* Active Store Status */}
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300 font-mono text-[11px] truncate max-w-[160px]">
              {connectionDetails.store}
            </span>
          </div>

          {/* Test Mode Switch */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-medium text-slate-400">Demo Mode</span>
            <button
              type="button"
              onClick={() => handleToggleTestMode(!isTestMode)}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                isTestMode ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  isTestMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. MAIN BODY WORKSPACE
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─────────────────────────────────────────────────────────
            VIEW 1: OPERATIONS CONSOLE (Chat + Evidence Inspector)
           ───────────────────────────────────────────────────────── */}
        {activeTab === 'console' && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Center Chat Workspace */}
            <div className="flex-1 flex flex-col bg-white border-r border-slate-200 min-w-0">
              {/* Creative Hero Banner (Clean, Minimalist, Creative) */}
              <div className="p-6 bg-gradient-to-r from-white via-emerald-50/40 to-teal-50/50 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                      Live Operational Gateway
                    </span>
                    <span className="text-xs text-slate-400 font-mono">• Read-Only Protocol</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    Autonomous Inventory & Order Intelligence
                  </h2>
                  <p className="text-xs text-slate-500 max-w-xl">
                    Cross-correlates order demand against real-time stock to flag shortages (like Order #10482) before shipping.
                  </p>
                </div>

                <button
                  onClick={() => handleSendMessage('What orders need my attention today?')}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-all hover:scale-[1.02] shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Inspect Deficit #10482</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Preset Action Pills */}
              <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-500" /> Actions:
                </span>
                {PRESET_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(p.query)}
                    className="text-xs shrink-0 px-3 py-1 rounded-full bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 transition-all font-medium shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#fbfcfd]">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white font-medium shadow-sm'
                          : 'bg-white border border-slate-200/90 text-slate-800 shadow-xs'
                      }`}
                    >
                      {msg.sender === 'agent' && (
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-blue-600" />
                            <span className="font-bold text-[11px] text-slate-900 tracking-wide">
                              MerchantOps Agent
                            </span>
                          </div>

                          {msg.toolCallsMade && msg.toolCallsMade.length > 0 && (
                            <div className="flex items-center gap-1">
                              {msg.toolCallsMade.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
                                >
                                  ⚡ {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Markdown Text */}
                      <div className="space-y-2 whitespace-pre-wrap text-xs">
                        {msg.text.split('\n\n').map((paragraph, pIdx) => {
                          if (paragraph.startsWith('### ')) {
                            return (
                              <h3 key={pIdx} className="text-sm font-bold text-slate-900 mt-2 mb-1">
                                {paragraph.replace('### ', '')}
                              </h3>
                            );
                          }
                          if (paragraph.startsWith('#### ')) {
                            return (
                              <h4 key={pIdx} className="text-xs font-bold text-amber-700 mt-2 mb-0.5">
                                {paragraph.replace('#### ', '')}
                              </h4>
                            );
                          }
                          return (
                            <p key={pIdx} className="text-slate-700 leading-relaxed">
                              {paragraph}
                            </p>
                          );
                        })}
                      </div>

                      {/* Attention Cards inside Chat */}
                      {msg.attentionItems && msg.attentionItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            <span>Correlated Operational Flags ({msg.attentionItems.length})</span>
                            <span className="text-blue-600 font-semibold lowercase">
                              Click card to view ground truth evidence
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            {msg.attentionItems.map((item) => (
                              <div
                                key={item.id}
                                onClick={() => {
                                  setSelectedAttentionItem(item);
                                  setInspectorView('evidence');
                                }}
                                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                  selectedAttentionItem?.id === item.id
                                    ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        item.priority === 'critical'
                                          ? 'bg-rose-100 text-rose-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {item.priority}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      Order #{item.orderNumber}
                                    </span>
                                    <span className="font-mono text-slate-600 font-semibold">
                                      ({item.total})
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 uppercase">
                                    {item.status}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-700 mt-1.5 font-medium line-clamp-1">
                                  {item.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {isThinking && (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 p-3 bg-white border border-slate-200 rounded-xl w-fit shadow-2xs">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Cross-referencing WooCommerce orders with warehouse inventory...</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Ask about orders, products, inventory shortages, or fulfillment risks..."
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                    disabled={isThinking}
                  />
                  <button
                    type="submit"
                    disabled={!inputQuery.trim() || isThinking}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-xs"
                  >
                    <span>Send</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

            {/* Right Side: Evidence & Execution Inspector */}
            <div className="w-full lg:w-96 bg-white border-l border-slate-200 flex flex-col shrink-0">
              {/* Inspector Header Tabs */}
              <div className="flex border-b border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setInspectorView('evidence')}
                  className={`flex-1 py-3 text-center border-b-2 transition-all ${
                    inspectorView === 'evidence'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Evidence Chain
                </button>
                <button
                  onClick={() => setInspectorView('trace')}
                  className={`flex-1 py-3 text-center border-b-2 transition-all ${
                    inspectorView === 'trace'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  MCP Traces ({selectedActivities.length})
                </button>
                <button
                  onClick={() => setInspectorView('mcp')}
                  className={`flex-1 py-3 text-center border-b-2 transition-all ${
                    inspectorView === 'mcp'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Tools (6)
                </button>
              </div>

              {/* Inspector Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inspectorView === 'evidence' && (
                  <div className="space-y-4 text-xs">
                    {selectedAttentionItem ? (
                      <>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-sm">
                              Order #{selectedAttentionItem.orderNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                selectedAttentionItem.priority === 'critical'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {selectedAttentionItem.priority}
                            </span>
                          </div>
                          <div className="text-slate-600 font-mono text-[11px]">
                            Total: <strong className="text-slate-900">{selectedAttentionItem.total}</strong> | Status: {selectedAttentionItem.status}
                          </div>
                          <p className="text-slate-700 font-medium">{selectedAttentionItem.reason}</p>
                        </div>

                        {/* Evidence Items */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Multi-Source Evidence
                          </span>

                          {selectedAttentionItem.evidence.map((ev, eIdx) => (
                            <div
                              key={eIdx}
                              className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                                  {ev.source}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500">{ev.metric}</span>
                              </div>
                              <div className="flex items-baseline space-x-2 pt-0.5">
                                <span className="text-base font-bold text-slate-900">{ev.value}</span>
                                {ev.thresholdOrExpected !== undefined && (
                                  <span className="text-[10px] text-slate-400">
                                    (Expected: {ev.thresholdOrExpected})
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 leading-snug">{ev.explanation}</p>
                            </div>
                          ))}
                        </div>

                        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Zero Hallucination Guarantee</span>
                          </div>
                          <p className="text-[10px] text-emerald-700">
                            Ground-truth verified against upstream WooCommerce orders and product stock counts.
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-slate-400 space-y-2">
                        <Flame className="w-8 h-8 mx-auto text-slate-300" />
                        <p>No operational item selected.</p>
                        <p className="text-[11px]">Click an attention flag in chat or the Fulfillment tab.</p>
                      </div>
                    )}
                  </div>
                )}

                {inspectorView === 'trace' && (
                  <div className="space-y-3 text-xs">
                    {selectedActivities.length > 0 ? (
                      selectedActivities.map((act, idx) => (
                        <div
                          key={act.id || idx}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 font-mono text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-700">⚡ {act.toolName || act.step}</span>
                            <span className="text-[10px] text-slate-400">{act.latencyMs}ms</span>
                          </div>
                          <p className="text-slate-600 font-sans text-xs">{act.title}</p>
                          {act.outputSnippet && (
                            <div className="p-2 bg-slate-900 text-slate-200 rounded text-[10px] overflow-x-auto whitespace-pre-wrap max-h-32">
                              {act.outputSnippet}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-slate-400 space-y-2">
                        <Activity className="w-8 h-8 mx-auto text-slate-300" />
                        <p>No MCP traces recorded yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {inspectorView === 'mcp' && (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-slate-900 text-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-sky-400">@modelcontextprotocol/sdk</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                          READY
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Official MCP server running over stdio & SSE transport (/sse).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        6 Bounded Tools
                      </span>
                      {[
                        { name: 'search_orders', desc: 'List & filter orders with status, date, SKU' },
                        { name: 'get_order', desc: 'Fetch single order with masked PII' },
                        { name: 'search_products', desc: 'Catalog search by SKU or title' },
                        { name: 'get_product', desc: 'Get inventory snapshots and price' },
                        { name: 'find_low_stock_products', desc: 'Filter stock below threshold' },
                        { name: 'find_orders_needing_attention', desc: 'Cross-resource attention logic' },
                      ].map((t, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="font-mono font-bold text-blue-700 text-[11px]">{t.name}</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────
            VIEW 2: FULFILLMENT ATTENTION (Live Queue)
           ───────────────────────────────────────────────────────── */}
        {activeTab === 'attention' && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6 overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Fulfillment Attention Queue</h2>
                <p className="text-xs text-slate-500">
                  Cross-resource radar detecting stock deficits and delayed pending orders
                </p>
              </div>

              <button
                onClick={loadAttentionQueue}
                disabled={isLoadingQueue}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoadingQueue ? 'animate-spin' : ''}`} />
                <span>Refresh Queue</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {attentionQueue.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-3 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => {
                    setSelectedAttentionItem(item);
                    setActiveTab('console');
                    setInspectorView('evidence');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          item.priority === 'critical'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">Order #{item.orderNumber}</span>
                    </div>
                    <span className="font-mono text-xs text-slate-600 font-bold">{item.total}</span>
                  </div>

                  <p className="text-xs text-slate-700 font-medium leading-relaxed">{item.reason}</p>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Primary Shortage Evidence
                    </span>
                    {item.evidence.slice(0, 2).map((ev, eIdx) => (
                      <div key={eIdx} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-500">{ev.metric}:</span>
                        <strong className="text-slate-900">{ev.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold">
                    <span>Inspect multi-source evidence</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────
            VIEW 3: WOOCOMMERCE CONNECTOR SETTINGS
           ───────────────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="p-8 max-w-4xl mx-auto w-full space-y-6 overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">WooCommerce Private Connector</h2>
                <p className="text-xs text-slate-500">
                  Configure store credentials, verify read-only boundaries, and manage API keys
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isConnected ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-rose-500 ring-4 ring-rose-100'
                  }`}
                />
                <span className="text-xs font-semibold text-slate-700">
                  {isConnected ? 'Connected & Bounded' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Credential Form */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 font-bold">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">REST API v3 Credentials</h4>
                    <p className="text-xs text-slate-500">
                      Standard WooCommerce Consumer Key & Secret with strictly read-only scopes
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500 font-medium">Mode:</span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 font-bold text-slate-800">
                    {isTestMode ? 'Demo Synthetic' : 'Live Store'}
                  </span>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Store URL</label>
                  <input
                    type="text"
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="https://your-store.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Consumer Key</label>
                    <input
                      type="text"
                      value={consumerKey}
                      onChange={(e) => setConsumerKey(e.target.value)}
                      placeholder="ck_..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Consumer Secret</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={consumerSecret}
                        onChange={(e) => setConsumerSecret(e.target.value)}
                        placeholder="cs_..."
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {connMessage && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium ${
                      isConnected
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {connMessage}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-400">
                    Keys are kept strictly in memory and scrubbed from all JSON log outputs.
                  </span>

                  <button
                    onClick={handleTestConnection}
                    disabled={isTestingConn}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    {isTestingConn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Test & Verify Connection</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Safety Guarantees */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Physical Read-Only Boundary</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  State mutation attempts (orders/products creation, status updates, or refunds) are blocked at the protocol layer before dispatch.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                  <RefreshCw className="w-4 h-4 text-blue-600" />
                  <span>Rate Limit & Jitter Backoff</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  HTTP 429 and 5xx responses trigger exponential backoff with full jitter and `Retry-After` header parsing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────
            VIEW 4: AUDIT TRAIL
           ───────────────────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div className="p-8 max-w-6xl mx-auto w-full space-y-6 overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Merchant Operations Audit Trail</h2>
                <p className="text-xs text-slate-500">
                  Immutable record of all MCP tool invocations, latencies, and parameter summaries
                </p>
              </div>
              <button
                onClick={loadAuditLogs}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Refresh Logs</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Request ID</th>
                    <th className="p-3.5">Tool Name</th>
                    <th className="p-3.5">Latency</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Input Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                        No audit events recorded yet. Run a prompt in Operations Console.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="p-3.5 text-slate-500 font-sans">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3.5 text-blue-600">{log.requestId.slice(0, 10)}...</td>
                        <td className="p-3.5 font-bold text-slate-800">{log.toolName}</td>
                        <td className="p-3.5 text-slate-500">{log.latencyMs}ms</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-500 max-w-xs truncate">{log.inputSummary}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. CLEAN FOOTER
         ───────────────────────────────────────────────────────────── */}
      <footer className="h-9 border-t border-slate-200/90 bg-white px-8 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <span>Razorpay Agent Studio • MerchantOps WooCommerce Private Connector</span>
        <div className="flex items-center space-x-3">
          <span className="font-mono text-[10px] text-slate-400">
            Mode: {isTestMode ? 'Synthetic Ground Truth (Apex Retail)' : 'Live Store'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        </div>
      </footer>
    </div>
  );
}
