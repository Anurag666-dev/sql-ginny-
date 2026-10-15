import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import { QueryPreviewModal } from '../components/QueryPreviewModal';
import { useAuth } from '../contexts/AuthContext';
import {
  Send,
  Square,
  Sparkles,
  User as UserIcon,
  Trash2,
  Plus,
  MessageSquare,
  Database,
  ArrowRight,
  CheckCircle2,
  Download,
  RotateCcw,
  ExternalLink,
  Code2,
  Check,
  Copy,
  ChevronDown,
  Search,
  Zap,
  Key,
  X
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ToolExecution {
  tool: string;
  args: any;
  result?: any;
  status: 'running' | 'completed';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tools?: ToolExecution[];
  resultIds?: string[];
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  context_length: number;
  is_free: boolean;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

export const Chat: React.FC = () => {
  const { user } = useAuth();

  // OpenRouter Model Selection State (LibreChat Style)
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ginny_selected_model') || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
  });
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [modelFilterTab, setModelFilterTab] = useState<'free' | 'paid' | 'all'>('free');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>(() => {
    return localStorage.getItem('ginny_openrouter_api_key') || '';
  });
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [tempApiKeyInput, setTempApiKeyInput] = useState('');
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('ginny_conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
    return [{
      id: 'default',
      title: 'New Investigation',
      createdAt: new Date().toISOString(),
      messages: []
    }];
  });

  const [activeConvoId, setActiveConvoId] = useState<string>(() => {
    const saved = localStorage.getItem('ginny_conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
          return parsed[0].id;
        }
      } catch { /* ignore */ }
    }
    return 'default';
  });

  // Chat Input & Streaming State
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Result Preview Modal State
  const [previewResultId, setPreviewResultId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConvoId) || conversations[0] || {
    id: 'default',
    title: 'New Investigation',
    createdAt: new Date().toISOString(),
    messages: []
  };

  // Fetch available models from backend on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/chat/models`);
        if (res.data?.models && Array.isArray(res.data.models)) {
          setAvailableModels(res.data.models);
          if (!localStorage.getItem('ginny_selected_model') && res.data.default_model) {
            setSelectedModel(res.data.default_model);
          }
        }
      } catch (err) {
        console.warn('Could not load dynamic models from backend, using default list:', err);
      }
    };
    fetchModels();
  }, []);

  // Close model selector dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelSelectorOpen(false);
      }
    };
    if (isModelSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModelSelectorOpen]);

  // Sync activeConvoId if current selection is invalid
  useEffect(() => {
    if (!conversations.some(c => c.id === activeConvoId) && conversations.length > 0) {
      setActiveConvoId(conversations[0].id);
    }
  }, [conversations, activeConvoId]);

  // Sync conversations to localStorage
  useEffect(() => {
    localStorage.setItem('ginny_conversations', JSON.stringify(conversations));
  }, [conversations]);

  // Scroll to bottom on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation.messages, isStreaming]);

  const createNewChat = () => {
    const newConvo: Conversation = {
      id: Date.now().toString(),
      title: `Chat ${conversations.length + 1}`,
      createdAt: new Date().toISOString(),
      messages: []
    };
    setConversations([newConvo, ...conversations]);
    setActiveConvoId(newConvo.id);
  };

  const clearCurrentChat = () => {
    setConversations(prev => prev.map(c => {
      if (c.id === activeConversation.id) {
        return {
          ...c,
          title: 'New Investigation',
          messages: []
        };
      }
      return c;
    }));
    setIsStreaming(false);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = conversations.filter(c => c.id !== id);
    if (filtered.length === 0) {
      const resetConvo: Conversation = {
        id: Date.now().toString(),
        title: 'New Investigation',
        createdAt: new Date().toISOString(),
        messages: []
      };
      setConversations([resetConvo]);
      setActiveConvoId(resetConvo.id);
    } else {
      setConversations(filtered);
      if (activeConvoId === id) {
        setActiveConvoId(filtered[0].id);
      }
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Submit and stream message via SSE
  const handleSendMessage = async (textToSend?: string) => {
    if (isSubmittingRef.current) return;
    const prompt = (textToSend || inputMessage).trim();
    if (!prompt) return;

    isSubmittingRef.current = true;

    // Reset streaming safety if already running
    if (isStreaming) {
      handleStopStream();
    }

    setInputMessage('');
    const targetConvoId = activeConversation.id;

    // Append user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Prepare assistant placeholder message
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tools: [],
      resultIds: []
    };

    // Update conversation title if first message
    const updatedMessages = [...activeConversation.messages, userMsg];
    let newTitle = activeConversation.title;
    if (activeConversation.messages.length === 0) {
      newTitle = prompt.slice(0, 32) + (prompt.length > 32 ? '...' : '');
    }

    setConversations(prev => prev.map(c => {
      if (c.id === targetConvoId) {
        return {
          ...c,
          title: newTitle,
          messages: [...updatedMessages, assistantMsg]
        };
      }
      return c;
    }));

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyPayload = updatedMessages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ginny_token') || ''}`
        },
        body: JSON.stringify({
          messages: historyPayload,
          model: selectedModel,
          api_key: openRouterApiKey || undefined,
          temperature: 0.2
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream available.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const dataJsonStr = trimmed.replace('data:', '').trim();
          if (!dataJsonStr) continue;

          try {
            const data = JSON.parse(dataJsonStr);

            if (data.type === 'content') {
              setConversations(prev => prev.map(c => {
                if (c.id === targetConvoId) {
                  return {
                    ...c,
                    messages: c.messages.map(m =>
                      m.id === assistantMsgId
                        ? { ...m, content: m.content + data.delta }
                        : m
                    )
                  };
                }
                return c;
              }));
            } else if (data.type === 'tool_start') {
              setConversations(prev => prev.map(c => {
                if (c.id === targetConvoId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => {
                      if (m.id === assistantMsgId) {
                        const prevTools = m.tools || [];
                        return {
                          ...m,
                          tools: [
                            ...prevTools,
                            {
                              tool: data.tool,
                              args: data.args,
                              status: 'running' as const
                            }
                          ]
                        };
                      }
                      return m;
                    })
                  };
                }
                return c;
              }));
            } else if (data.type === 'tool_result') {
              setConversations(prev => prev.map(c => {
                if (c.id === targetConvoId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => {
                      if (m.id === assistantMsgId && m.tools) {
                        return {
                          ...m,
                          tools: m.tools.map(t =>
                            (t.tool === data.tool && t.status === 'running')
                              ? { ...t, status: 'completed' as const, result: data.result }
                              : t
                          )
                        };
                      }
                      return m;
                    })
                  };
                }
                return c;
              }));
            } else if (data.type === 'done') {
              setConversations(prev => prev.map(c => {
                if (c.id === targetConvoId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => {
                      if (m.id === assistantMsgId) {
                        return {
                          ...m,
                          resultIds: data.result_ids && data.result_ids.length > 0 ? data.result_ids : m.resultIds,
                          tools: m.tools ? m.tools.map(t => ({ ...t, status: 'completed' as const })) : []
                        };
                      }
                      return m;
                    })
                  };
                }
                return c;
              }));
            } else if (data.type === 'error') {
              setConversations(prev => prev.map(c => {
                if (c.id === targetConvoId) {
                  return {
                    ...c,
                    messages: c.messages.map(m => {
                      if (m.id === assistantMsgId) {
                        return {
                          ...m,
                          content: m.content + `\n\n> ⚠️ **Notice:** ${data.message}`,
                          tools: m.tools ? m.tools.map(t => ({ ...t, status: 'completed' as const })) : []
                        };
                      }
                      return m;
                    })
                  };
                }
                return c;
              }));
            }
          } catch (e) {
            // non-json chunk
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Streaming error:', err);
        setConversations(prev => prev.map(c => {
          if (c.id === targetConvoId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + `\n\n> ❌ **Connection Issue:** ${err.message || 'Could not stream response.'}` }
                  : m
              )
            };
          }
          return c;
        }));
      }
    } finally {
      setIsStreaming(false);
      isSubmittingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch { /* ignore */ }
    }
    setIsStreaming(false);
  };

  const handleOpenPreview = (resId: string) => {
    setPreviewResultId(resId);
    setIsPreviewOpen(true);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Navbar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar: Conversations & Navigation */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col justify-between p-3 select-none">
          <div className="space-y-3 overflow-hidden flex flex-col h-full">
            <button
              onClick={createNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition"
            >
              <Plus className="h-4 w-4" />
              <span>New Investigation</span>
            </button>

            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-2">
              Recent Chats
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {conversations.map(convo => (
                <div
                  key={convo.id}
                  onClick={() => setActiveConvoId(convo.id)}
                  className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs transition cursor-pointer ${
                    activeConvoId === convo.id
                      ? 'bg-slate-800 text-white font-medium border border-slate-700'
                      : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{convo.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(convo.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition"
                    title="Delete Chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Footer info */}
          <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400 text-[11px] px-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live FastMCP Agent
              </span>
              <span className="font-mono text-[10px] text-slate-500">v1.0</span>
            </div>
          </div>
        </aside>

        {/* Main Chat Interface */}
        <main className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
          {/* Top Bar: LibreChat-Style Model Selector & Clean Status */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6 py-2.5 z-30">
            <div className="flex items-center gap-3">
              {/* LibreChat-Style Interactive Model Selector */}
              <div className="relative" ref={modelDropdownRef}>
                {(() => {
                  const activeModelObj = availableModels.find(m => m.id === selectedModel) || {
                    id: selectedModel,
                    name: selectedModel.includes('nemotron') ? 'NVIDIA: Nemotron 3 Nano Omni (free)' : selectedModel,
                    provider: selectedModel.split('/')[0].toUpperCase(),
                    is_free: selectedModel.includes(':free') || selectedModel.includes('/free') || selectedModel.includes('nemotron')
                  };

                  const freeCount = availableModels.filter(m => m.is_free).length;
                  const paidCount = availableModels.filter(m => !m.is_free).length;
                  const displayedModels = availableModels.filter(m => {
                    if (modelFilterTab === 'free' && !m.is_free) return false;
                    if (modelFilterTab === 'paid' && m.is_free) return false;
                    if (modelSearchQuery.trim()) {
                      const q = modelSearchQuery.toLowerCase();
                      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
                    }
                    return true;
                  });

                  return (
                    <>
                      <button
                        onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                        className="flex items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-850 hover:border-sky-500/50 hover:bg-slate-800 px-3 py-1.5 text-xs text-white transition shadow-sm group"
                      >
                        <span className={`h-2 w-2 rounded-full ${activeModelObj.is_free ? 'bg-emerald-400' : 'bg-purple-400'} animate-pulse`} />
                        <span className="font-semibold text-slate-100 group-hover:text-sky-300 transition max-w-[200px] truncate">
                          {activeModelObj.name}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          activeModelObj.is_free
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {activeModelObj.is_free ? 'FREE' : 'PAID'}
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isModelSelectorOpen ? 'rotate-180 text-sky-400' : ''}`} />
                      </button>

                      {/* Dropdown Popover */}
                      {isModelSelectorOpen && (
                        <div className="absolute left-0 mt-2 w-[460px] max-w-[95vw] rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden text-xs flex flex-col">
                          {/* Search Header */}
                          <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center gap-2">
                            <Search className="h-4 w-4 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              value={modelSearchQuery}
                              onChange={e => setModelSearchQuery(e.target.value)}
                              placeholder="Search OpenRouter models by name or provider..."
                              className="w-full bg-transparent text-slate-100 placeholder-slate-500 outline-none text-xs"
                              autoFocus
                            />
                            {modelSearchQuery && (
                              <button onClick={() => setModelSearchQuery('')} className="text-slate-400 hover:text-white">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Free / Paid Filter Tabs */}
                          <div className="flex items-center gap-1 p-2 border-b border-slate-800 bg-slate-900/80">
                            <button
                              onClick={() => setModelFilterTab('free')}
                              className={`flex-1 py-1 px-2.5 rounded-lg text-center font-medium transition ${
                                modelFilterTab === 'free'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                              }`}
                            >
                              ✨ Free Models ({freeCount})
                            </button>
                            <button
                              onClick={() => setModelFilterTab('paid')}
                              className={`flex-1 py-1 px-2.5 rounded-lg text-center font-medium transition ${
                                modelFilterTab === 'paid'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                              }`}
                            >
                              💎 Paid Models ({paidCount})
                            </button>
                            <button
                              onClick={() => setModelFilterTab('all')}
                              className={`flex-1 py-1 px-2.5 rounded-lg text-center font-medium transition ${
                                modelFilterTab === 'all'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                              }`}
                            >
                              All ({availableModels.length})
                            </button>
                          </div>

                          {/* Scrollable Model Cards List */}
                          <div className="max-h-72 overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
                            {displayedModels.length === 0 ? (
                              <div className="py-8 text-center text-slate-500">
                                No models matching "{modelSearchQuery}"
                              </div>
                            ) : (
                              displayedModels.map(m => {
                                const isSelected = selectedModel === m.id;
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      setSelectedModel(m.id);
                                      localStorage.setItem('ginny_selected_model', m.id);
                                      setIsModelSelectorOpen(false);
                                    }}
                                    className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-3 ${
                                      isSelected
                                        ? 'bg-sky-500/15 border border-sky-500/30 text-white'
                                        : 'hover:bg-slate-800/60 text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-white text-xs truncate">{m.name}</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                                          m.is_free
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        }`}>
                                          {m.is_free ? 'FREE' : 'PAID'}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{m.id}</div>
                                      {m.description && (
                                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{m.description}</p>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                                      {m.context_length > 0 && (
                                        <span className="text-[10px] text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded font-mono">
                                          {Math.round(m.context_length / 1024)}k ctx
                                        </span>
                                      )}
                                      {isSelected && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>

                          {/* Custom Model ID Direct Input */}
                          <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center gap-2">
                            <input
                              type="text"
                              value={customModelInput}
                              onChange={e => setCustomModelInput(e.target.value)}
                              placeholder="Or enter custom OpenRouter model ID..."
                              className="flex-1 bg-slate-850 border border-slate-750 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                            />
                            <button
                              onClick={() => {
                                if (customModelInput.trim()) {
                                  const customId = customModelInput.trim();
                                  setSelectedModel(customId);
                                  localStorage.setItem('ginny_selected_model', customId);
                                  setCustomModelInput('');
                                  setIsModelSelectorOpen(false);
                                }
                              }}
                              disabled={!customModelInput.trim()}
                              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-medium text-xs transition"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* API Key Configure Button */}
              <button
                onClick={() => {
                  setTempApiKeyInput(openRouterApiKey);
                  setIsApiKeyModalOpen(true);
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition ${
                  openRouterApiKey
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:border-emerald-500/50'
                    : 'border-slate-700 bg-slate-850 text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
                title="Configure OpenRouter API Key"
              >
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden sm:inline">{openRouterApiKey ? 'Custom Key' : 'API Key'}</span>
              </button>

              <span className="hidden lg:inline text-[11px] text-slate-400">
                Live: Memgraph (7687) • PostgreSQL (5433) • MongoDB (27017) • Redis (6379)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={clearCurrentChat}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-850 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-white transition"
                title="Clear messages in this conversation"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Quick API Key Modal */}
          {isApiKeyModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-xs space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-amber-400" />
                    <h3 className="font-bold text-white text-sm">OpenRouter API Configuration</h3>
                  </div>
                  <button onClick={() => setIsApiKeyModalOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-slate-300 leading-relaxed">
                  Enter your personal OpenRouter API key to call free and paid models with multi-step reasoning. Leave blank to use server environment key or the direct local engine.
                </p>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">OpenRouter API Key (sk-or-v1-...)</label>
                  <input
                    type="password"
                    value={tempApiKeyInput}
                    onChange={e => setTempApiKeyInput(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-sky-500 text-xs font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  {openRouterApiKey && (
                    <button
                      onClick={() => {
                        setOpenRouterApiKey('');
                        localStorage.removeItem('ginny_openrouter_api_key');
                        setIsApiKeyModalOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-950/20 text-xs transition mr-auto"
                    >
                      Remove Key
                    </button>
                  )}
                  <button
                    onClick={() => setIsApiKeyModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const cleanKey = tempApiKeyInput.trim();
                      setOpenRouterApiKey(cleanKey);
                      if (cleanKey) {
                        localStorage.setItem('ginny_openrouter_api_key', cleanKey);
                      } else {
                        localStorage.removeItem('ginny_openrouter_api_key');
                      }
                      setIsApiKeyModalOpen(false);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chat Messages Feed */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {activeConversation.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6 py-12">
                <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-4 shadow-xl shadow-sky-500/5">
                  <Sparkles className="h-10 w-10 text-sky-400 mx-auto" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">SQL Ginny Intelligence Assistant</h2>
                  <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                    Query PostgreSQL & MongoDB collections, execute BFS/DFS pathfinding over the Memgraph topology,
                    and preview cross-DB join results with 10-minute Redis caching.
                  </p>
                </div>

                {/* Prompt Suggestions */}
                <div className="grid grid-cols-2 gap-3 w-full text-left">
                  {[
                    { label: 'Show Orders', query: 'show me orders' },
                    { label: 'Relational Path Finder (BFS)', query: 'Find shortest join path between customers and product_reviews' },
                    { label: 'Customer Query', query: 'Show top 5 customers and their orders' },
                    { label: 'Cross-DB Join', query: 'Perform cross-database join between customers and MongoDB customer_profiles' },
                    { label: 'Database Discovery', query: 'Show all PostgreSQL tables, views, and MongoDB collections discovered' }
                  ].map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(s.query)}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300 hover:border-sky-500/40 hover:bg-slate-800 transition"
                    >
                      <div className="font-semibold text-white mb-1 flex items-center justify-between">
                        <span>{s.label}</span>
                        <ArrowRight className="h-3 w-3 text-sky-400" />
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{s.query}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 max-w-4xl mx-auto ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  )}

                  <div className={`space-y-3 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {/* User bubble */}
                    {msg.role === 'user' ? (
                      <div className="rounded-2xl bg-sky-600 px-4 py-3 text-xs text-white shadow-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    ) : (
                      /* Assistant container */
                      <div className="space-y-3">
                        {/* Tool Executions */}
                        {msg.tools && msg.tools.length > 0 && (
                          <div className="space-y-2">
                            {msg.tools.map((t, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs space-y-2"
                              >
                                <div className="flex items-center justify-between font-mono text-[11px]">
                                  <span className="flex items-center gap-2 text-sky-300 font-semibold">
                                    <Database className="h-3.5 w-3.5 text-sky-400" />
                                    {t.tool}
                                  </span>
                                  {t.status === 'running' ? (
                                    <span className="text-amber-400 flex items-center gap-1 animate-pulse">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                      Executing...
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Done
                                    </span>
                                  )}
                                </div>

                                {t.args && Object.keys(t.args).length > 0 && (
                                  <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2 rounded-lg">
                                    {JSON.stringify(t.args, null, 2)}
                                  </div>
                                )}

                                {t.result && (
                                  <div className="text-[11px] text-slate-300">
                                    {t.result.hops !== undefined && (
                                      <div className="text-sky-300 font-medium">
                                        Shortest Path ({t.result.hops} hops): {t.result.path_sequence?.join(' ➔ ')}
                                      </div>
                                    )}
                                    {t.result.sql_join_template && (
                                      <div className="font-mono text-[10px] text-indigo-300 bg-slate-950 p-2 rounded mt-1">
                                        {t.result.sql_join_template}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Assistant text message */}
                        {msg.content && (
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs text-slate-200 leading-relaxed shadow-sm whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        )}

                        {/* Result Confirmation & Download Cards */}
                        {msg.resultIds && msg.resultIds.length > 0 && (
                          <div className="space-y-2">
                            {msg.resultIds.map(resId => (
                              <div
                                key={resId}
                                className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs space-y-2.5"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    <span className="font-semibold text-emerald-200">
                                      Result Cached in Redis (10m TTL)
                                    </span>
                                  </div>
                                  <span className="font-mono text-[11px] bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/50">
                                    ID: {resId}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => handleOpenPreview(resId)}
                                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-500 transition shadow-sm text-xs"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Preview Top 5 Rows
                                  </button>

                                  <a
                                    href={`${API_URL}/api/preview/${resId}/download?format=csv`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1 text-slate-300 hover:text-white transition text-xs"
                                  >
                                    <Download className="h-3 w-3" />
                                    <span>CSV</span>
                                  </a>

                                  <a
                                    href={`${API_URL}/api/preview/${resId}/download?format=json`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1 text-slate-300 hover:text-white transition text-xs"
                                  >
                                    <Download className="h-3 w-3" />
                                    <span>JSON</span>
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <UserIcon className="h-4 w-4 text-slate-300" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Bar */}
          <div className="border-t border-slate-800 bg-slate-900/60 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="max-w-4xl mx-auto flex gap-3 items-end"
            >
              <div className="relative flex-1">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask SQL Ginny about tables, join paths, or cross-database queries..."
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStream}
                  className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-semibold text-white hover:bg-rose-500 transition shadow-sm flex items-center gap-1.5 h-[52px]"
                >
                  <Square className="h-4 w-4 fill-white" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="rounded-xl bg-sky-600 px-5 py-3 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40 transition shadow-sm flex items-center gap-1.5 h-[52px]"
                >
                  <Send className="h-4 w-4" />
                  <span>Send</span>
                </button>
              )}
            </form>

            <div className="max-w-4xl mx-auto mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Enter to send, Shift+Enter for new line</span>
              <span>FastMCP Tools: BFS, DFS, PostgreSQL, MongoDB, Cross-DB Hash Join, Redis Cache</span>
            </div>
          </div>
        </main>
      </div>

      {/* Query Preview Modal */}
      <QueryPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        initialResultId={previewResultId}
      />
    </div>
  );
};
