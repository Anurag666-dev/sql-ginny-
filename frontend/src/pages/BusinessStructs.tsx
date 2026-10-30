import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import { BookOpen, Plus, Trash2, Search, Sparkles } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const BusinessStructs: React.FC = () => {
  const [structs, setStructs] = useState<any[]>([]);
  const [, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // New struct modal/form
  const [showAddForm, setShowAddForm] = useState(false);
  const [structName, setStructName] = useState('');
  const [structType, setStructType] = useState('domain_rule');
  const [targetEntities, setTargetEntities] = useState('customers, orders');
  const [description, setDescription] = useState('');
  const [sqlExpression, setSqlExpression] = useState('');
  const [saving, setSaving] = useState(false);

  // Semantic RAG search test
  const [testQuery, setTestQuery] = useState('');
  const [ragMatches, setRagMatches] = useState<any[] | null>(null);
  const [searchingRag, setSearchingRag] = useState(false);

  useEffect(() => {
    fetchStructs();
  }, []);

  const fetchStructs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/business-structs`);
      setStructs(res.data.records || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch business structs.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const entitiesArray = targetEntities.split(',').map((s) => s.trim()).filter(Boolean);
      await axios.post(`${API_URL}/api/business-structs`, {
        struct_name: structName,
        struct_type: structType,
        target_entities: entitiesArray,
        description,
        sql_expression: sqlExpression,
      });
      setShowAddForm(false);
      setStructName('');
      setDescription('');
      setSqlExpression('');
      fetchStructs();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save business context.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}'?`)) return;
    try {
      await axios.delete(`${API_URL}/api/business-structs/${name}`);
      fetchStructs();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete.');
    }
  };

  const handleTestRAG = async () => {
    if (!testQuery.trim()) return;
    setSearchingRag(true);
    try {
      const res = await axios.post(`${API_URL}/api/business-structs/search-rag`, {
        query: testQuery,
        top_k: 3,
      });
      setRagMatches(res.data.matched_contexts || []);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'RAG search failed.');
    } finally {
      setSearchingRag(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <Navbar />

      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <BookOpen className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Business Context & RAG Structs</h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Domain knowledge, metric calculations, and cross-db recipes stored in PostgreSQL with 384-dim BERT pgvector embeddings
            </p>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
          >
            <Plus className="h-4 w-4 text-white" />
            <span>{showAddForm ? 'Close Form' : 'Add Business Struct'}</span>
          </button>
        </div>

        {/* Live Vector Semantic Similarity Search Tester */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-900" />
            <h2 className="text-sm font-bold text-slate-900">Pre-Query RAG Context Retrieval Test</h2>
          </div>
          <p className="text-xs text-slate-500">
            Before formulating SQL or Mongo queries, user goals are embedded into 384-dimensional dense vectors to pull relevant domain context.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Enter a natural language question (e.g. 'How is customer lifetime value calculated?')..."
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
            <button
              onClick={handleTestRAG}
              disabled={searchingRag || !testQuery.trim()}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
            >
              <Search className="h-4 w-4 text-white" />
              <span>{searchingRag ? 'Computing Cosine Distance...' : 'Retrieve Context (pgvector)'}</span>
            </button>
          </div>

          {ragMatches && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Top Vector Matches ({ragMatches.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ragMatches.map((m: any, idx: number) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{m.struct_name}</span>
                      <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-700">
                        sim: {m.similarity !== undefined ? m.similarity.toFixed(4) : (1 - (m.distance || 0)).toFixed(4)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{m.description}</p>
                    {m.sql_expression && (
                      <pre className="font-mono text-[10px] text-slate-800 bg-white border border-slate-200 p-2 rounded overflow-x-auto">
                        {m.sql_expression}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add Struct Form */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="rounded-2xl border border-slate-300 bg-white p-6 space-y-4 shadow-md">
            <h3 className="text-sm font-bold text-slate-900">Define New Business Domain Context</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Struct Name (Unique Key)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. vip_segment_definition"
                  value={structName}
                  onChange={(e) => setStructName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Struct Type</label>
                <select
                  value={structType}
                  onChange={(e) => setStructType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="domain_rule">Domain Rule</option>
                  <option value="kpi_metric">KPI Metric</option>
                  <option value="join_recipe">Join Recipe</option>
                  <option value="schema_glossary">Schema Glossary</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Entities (Comma Separated)</label>
              <input
                type="text"
                required
                placeholder="customers, orders, mongo:customer_profiles"
                value={targetEntities}
                onChange={(e) => setTargetEntities(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Description / Semantic Context</label>
              <textarea
                required
                rows={3}
                placeholder="Comprehensive description of what this metric or rule entails..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">SQL Expression or Relational Formula (Optional)</label>
              <input
                type="text"
                placeholder="SELECT ... WHERE ..."
                value={sqlExpression}
                onChange={(e) => setSqlExpression(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Generating Embedding & Saving...' : 'Save Struct & Generate Vector'}
              </button>
            </div>
          </form>
        )}

        {/* Existing Business Structs List */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            All Business Context Entries ({structs.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {structs.map((s) => (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 hover:border-slate-300 transition shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{s.struct_name}</h3>
                    <span className="inline-block mt-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-300">
                      {s.struct_type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(s.struct_name)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    title="Delete struct"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>

                {s.sql_expression && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800">
                    {s.sql_expression}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-semibold text-slate-400">Entities:</span>
                  {s.target_entities?.map((ent: string, idx: number) => (
                    <span key={idx} className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-700">
                      {ent}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
