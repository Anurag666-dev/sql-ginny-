import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Navbar } from '../components/Navbar';
import {
  Layers,
  Database,
  Network,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Check,
  X,
  BookOpen
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ColumnDictItem {
  name: string;
  data_type: string;
  description: string;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
}

interface EntityItem {
  name: string;
  system: string;
  type: string;
  primary_key: string;
  description: string;
  fields?: string[];
  columns: ColumnDictItem[];
}

interface RelationshipItem {
  source: string;
  target: string;
  type: 'MUST_JOIN' | 'CONDITIONAL_JOIN' | 'OPTIONAL_JOIN';
  from_field: string;
  to_field: string;
  condition?: string | null;
  desc?: string | null;
}

export const SchemaStudio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'entities' | 'relationships'>('entities');
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [relationships, setRelationships] = useState<RelationshipItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [systemFilter, setSystemFilter] = useState<'ALL' | 'PostgreSQL' | 'MongoDB'>('ALL');

  // Entity Modal / Form State
  const [isEntityModalOpen, setIsEntityModalOpen] = useState<boolean>(false);
  const [isEditingEntity, setIsEditingEntity] = useState<boolean>(false);
  const [entityName, setEntityName] = useState<string>('');
  const [entitySystem, setEntitySystem] = useState<string>('PostgreSQL');
  const [entityType, setEntityType] = useState<string>('table');
  const [entityPrimaryKey, setEntityPrimaryKey] = useState<string>('id');
  const [entityDescription, setEntityDescription] = useState<string>('');
  const [entityColumns, setEntityColumns] = useState<ColumnDictItem[]>([]);
  const [isIntrospecting, setIsIntrospecting] = useState<boolean>(false);

  // Relationship Form State
  const [relSource, setRelSource] = useState<string>('');
  const [relTarget, setRelTarget] = useState<string>('');
  const [relType, setRelType] = useState<'MUST_JOIN' | 'CONDITIONAL_JOIN' | 'OPTIONAL_JOIN'>('MUST_JOIN');
  const [relFromField, setRelFromField] = useState<string>('');
  const [relToField, setRelToField] = useState<string>('');
  const [relCondition, setRelCondition] = useState<string>('');
  const [relDesc, setRelDesc] = useState<string>('');
  const [isSavingRel, setIsSavingRel] = useState<boolean>(false);

  const loadCatalog = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await axios.get(`${API_URL}/api/schema-studio/catalog`);
      if (res.data) {
        setEntities(res.data.entities || []);
        setRelationships(res.data.relationships || []);
      }
    } catch (err: any) {
      console.error('Failed to load schema catalog:', err);
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to connect to Memgraph.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenAddEntity = () => {
    setIsEditingEntity(false);
    setEntityName('');
    setEntitySystem('PostgreSQL');
    setEntityType('table');
    setEntityPrimaryKey('id');
    setEntityDescription('');
    setEntityColumns([
      { name: 'id', data_type: 'integer', description: 'Primary key identifier', is_primary_key: true }
    ]);
    setIsEntityModalOpen(true);
  };

  const handleOpenEditEntity = (ent: EntityItem) => {
    setIsEditingEntity(true);
    setEntityName(ent.name);
    setEntitySystem(ent.system);
    setEntityType(ent.type);
    setEntityPrimaryKey(ent.primary_key || (ent.system === 'MongoDB' ? '_id' : 'id'));
    setEntityDescription(ent.description || '');
    setEntityColumns(ent.columns && ent.columns.length > 0 ? [...ent.columns] : [
      { name: ent.primary_key || 'id', data_type: 'varchar', description: 'Primary identifier', is_primary_key: true }
    ]);
    setIsEntityModalOpen(true);
  };

  const handleIntrospectColumns = async () => {
    if (!entityName.trim()) {
      alert('Please enter a table or collection name first.');
      return;
    }
    try {
      setIsIntrospecting(true);
      const res = await axios.get(`${API_URL}/api/schema-studio/introspect-columns`, {
        params: { system: entitySystem, entity_name: entityName.trim() }
      });
      if (res.data?.columns && res.data.columns.length > 0) {
        const existingMap = new Map(entityColumns.map(c => [c.name, c.description]));
        const merged: ColumnDictItem[] = res.data.columns.map((c: any) => ({
          name: c.name,
          data_type: c.data_type,
          description: existingMap.get(c.name) || c.description || '',
          is_primary_key: c.is_primary_key,
          is_foreign_key: c.is_foreign_key
        }));
        setEntityColumns(merged);
        showSuccess(`Auto-populated ${merged.length} columns with data types from ${entitySystem}.`);
      } else {
        alert(`No columns found in live ${entitySystem} for '${entityName}'. You can define them manually.`);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Introspection failed.');
    } finally {
      setIsIntrospecting(false);
    }
  };

  const handleAddColumnRow = () => {
    setEntityColumns(prev => [
      ...prev,
      { name: '', data_type: entitySystem === 'MongoDB' ? 'string' : 'varchar', description: '', is_primary_key: false }
    ]);
  };

  const handleUpdateColumnField = (index: number, field: keyof ColumnDictItem, value: any) => {
    setEntityColumns(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveColumnRow = (index: number) => {
    setEntityColumns(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEntity = async () => {
    if (!entityName.trim()) {
      alert('Entity name is required.');
      return;
    }
    if (!entityDescription.trim()) {
      alert('Please provide a business description explaining what this table/collection represents.');
      return;
    }

    const validCols = entityColumns.filter(c => c.name.trim() !== '');
    try {
      const payload = {
        name: entityName.trim(),
        system: entitySystem,
        type: entityType,
        primary_key: entityPrimaryKey.trim(),
        description: entityDescription.trim(),
        columns: validCols
      };

      await axios.post(`${API_URL}/api/schema-studio/entity`, payload);
      setIsEntityModalOpen(false);
      showSuccess(`Entity '${entityName}' successfully saved to Memgraph with ${validCols.length} dictionary entries.`);
      loadCatalog();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save entity to Memgraph.');
    }
  };

  const handleDeleteEntity = async (name: string) => {
    if (!confirm(`Are you sure you want to delete entity '${name}' and all its connected relationships from Memgraph?`)) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/api/schema-studio/entity/${encodeURIComponent(name)}`);
      showSuccess(`Entity '${name}' deleted.`);
      loadCatalog();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete entity.');
    }
  };

  const handleSaveRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relSource || !relTarget || !relFromField || !relToField) {
      alert('Please select Source Entity, Target Entity, and their respective Join Columns.');
      return;
    }
    if (relSource === relTarget) {
      alert('Source and Target entity must be different.');
      return;
    }

    try {
      setIsSavingRel(true);
      const payload = {
        source: relSource,
        target: relTarget,
        type: relType,
        from_field: relFromField.trim(),
        to_field: relToField.trim(),
        condition: relCondition.trim() || null,
        desc: relDesc.trim() || `${relSource}.${relFromField} -> ${relTarget}.${relToField}`
      };

      await axios.post(`${API_URL}/api/schema-studio/relationship`, payload);
      showSuccess(`Relationship ${relSource} -[${relType}]-> ${relTarget} registered in Memgraph.`);
      setRelCondition('');
      setRelDesc('');
      loadCatalog();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save relationship.');
    } finally {
      setIsSavingRel(false);
    }
  };

  const handleDeleteRelationship = async (rel: RelationshipItem) => {
    if (!confirm(`Delete relationship ${rel.source} -[${rel.type}]-> ${rel.target}?`)) {
      return;
    }
    try {
      await axios.delete(`${API_URL}/api/schema-studio/relationship`, {
        data: { source: rel.source, target: rel.target, type: rel.type }
      });
      showSuccess(`Relationship deleted.`);
      loadCatalog();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete relationship.');
    }
  };

  const filteredEntities = entities.filter(ent => {
    const matchesSys = systemFilter === 'ALL' || ent.system.toLowerCase() === systemFilter.toLowerCase();
    const matchesSearch = !searchQuery ||
      ent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ent.columns && ent.columns.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesSys && matchesSearch;
  });

  const selectedSourceEntity = entities.find(e => e.name === relSource);
  const selectedTargetEntity = entities.find(e => e.name === relTarget);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 font-sans">
      <Navbar />

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                  Schema & Knowledge Studio
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-300">
                    Memgraph Port 7687
                  </span>
                </h1>
                <p className="text-sm text-slate-500">
                  Register entities, define column data-type dictionaries with business semantics, and establish join edges for multi-hop AI query formulation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadCatalog}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition shadow-sm"
              title="Reload catalog from Memgraph"
            >
              <RefreshCw className={`h-4 w-4 text-slate-700 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleOpenAddEntity}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
            >
              <Plus className="h-4 w-4 text-white" />
              <span>Register Entity</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div className="flex-1">{errorMsg}</div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {/* Studio Tabs */}
        <div className="mt-6 flex items-center justify-between border-b border-slate-200">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('entities')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === 'entities'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Database className="h-4 w-4" />
              <span>Entities & Column Dictionaries</span>
              <span className="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                {entities.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('relationships')}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === 'relationships'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Network className="h-4 w-4" />
              <span>Relationship Edge Studio</span>
              <span className="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                {relationships.length}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: ENTITIES & DICTIONARY */}
        {activeTab === 'entities' && (
          <div className="mt-6 space-y-6">
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search entities, columns, comments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-semibold text-slate-600">Database:</span>
                {(['ALL', 'PostgreSQL', 'MongoDB'] as const).map(sys => (
                  <button
                    key={sys}
                    onClick={() => setSystemFilter(sys)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      systemFilter === sys
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {sys === 'PostgreSQL' ? 'PostgreSQL' : sys === 'MongoDB' ? 'MongoDB' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredEntities.map((ent) => {
                const isMongo = ent.system === 'MongoDB';
                const colCount = ent.columns ? ent.columns.length : (ent.fields ? ent.fields.length : 0);

                return (
                  <div
                    key={ent.name}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition shadow-sm hover:shadow-md"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-900 tracking-tight">{ent.name}</span>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                              isMongo
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-800 border-slate-300'
                            }`}>
                              {isMongo ? 'MONGO' : 'PG'}
                            </span>
                            <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {ent.type}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditEntity(ent)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
                            title="Edit dictionary & meaning"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntity(ent.name)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Delete entity from Memgraph"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Business Description */}
                      <p className="mt-2.5 text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {ent.description || <span className="italic text-slate-400">No business meaning registered. Click edit to add context.</span>}
                      </p>

                      {/* Columns Preview */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-2">
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5 text-slate-700" />
                            Dictionary Columns ({colCount})
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">PK: {ent.primary_key || 'id'}</span>
                        </div>

                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                          {ent.columns && ent.columns.length > 0 ? (
                            ent.columns.map((c, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between gap-2 p-1.5 rounded bg-slate-50 text-xs border border-slate-200"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="font-mono font-semibold text-slate-900">{c.name}</span>
                                  {c.is_primary_key && (
                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">PK</span>
                                  )}
                                  <span className="text-[10px] font-mono text-slate-500">({c.data_type})</span>
                                </div>
                                <span className="text-[10px] text-slate-500 truncate max-w-[150px]" title={c.description}>
                                  {c.description || <span className="text-slate-400 italic">No description</span>}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-400 italic p-2">
                              No columns defined yet. Click edit to auto-populate from live database.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                      <button
                        onClick={() => handleOpenEditEntity(ent)}
                        className="text-xs text-slate-900 hover:underline font-bold flex items-center gap-1"
                      >
                        <span>Manage Dictionary</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: RELATIONSHIP EDGE STUDIO */}
        {activeTab === 'relationships' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Create/Update Relationship Form */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-200 mb-5">
                <Network className="h-5 w-5 text-slate-900" />
                <h3 className="text-base font-bold text-slate-900">Define Join Relationship</h3>
              </div>

              <form onSubmit={handleSaveRelationship} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Source Entity (From Node)
                  </label>
                  <select
                    value={relSource}
                    onChange={(e) => {
                      setRelSource(e.target.value);
                      setRelFromField('');
                    }}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="">-- Select Source Node --</option>
                    {entities.map(e => (
                      <option key={e.name} value={e.name}>
                        {e.name} ({e.system})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Source Join Column / Key
                  </label>
                  {selectedSourceEntity && selectedSourceEntity.columns && selectedSourceEntity.columns.length > 0 ? (
                    <select
                      value={relFromField}
                      onChange={(e) => setRelFromField(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                    >
                      <option value="">-- Select Column from {relSource} --</option>
                      {selectedSourceEntity.columns.map(c => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.data_type}) {c.description ? `- ${c.description.slice(0, 30)}...` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. customer_id, id, sku"
                      value={relFromField}
                      onChange={(e) => setRelFromField(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Relationship Edge Type
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setRelType('MUST_JOIN')}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs text-left transition ${
                        relType === 'MUST_JOIN'
                          ? 'border-slate-900 bg-slate-100 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-bold flex items-center gap-1.5 text-slate-900">
                          <span className="h-2 w-2 rounded-full bg-rose-600"></span>
                          MUST_JOIN (Strict Foreign Key)
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Required relational dependency. Orders must join customers.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRelType('CONDITIONAL_JOIN')}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs text-left transition ${
                        relType === 'CONDITIONAL_JOIN'
                          ? 'border-slate-900 bg-slate-100 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-bold flex items-center gap-1.5 text-slate-900">
                          <span className="h-2 w-2 rounded-full bg-amber-600"></span>
                          CONDITIONAL_JOIN (Predicate Filtered)
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Applies when a specific status/condition matches.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRelType('OPTIONAL_JOIN')}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs text-left transition ${
                        relType === 'OPTIONAL_JOIN'
                          ? 'border-slate-900 bg-slate-100 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-bold flex items-center gap-1.5 text-slate-900">
                          <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                          OPTIONAL_JOIN (Enrichment / Cross-DB)
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Optional dimension or MongoDB document hash join.</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Entity (To Node)
                  </label>
                  <select
                    value={relTarget}
                    onChange={(e) => {
                      setRelTarget(e.target.value);
                      setRelToField('');
                    }}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="">-- Select Target Node --</option>
                    {entities.map(e => (
                      <option key={e.name} value={e.name} disabled={e.name === relSource}>
                        {e.name} ({e.system})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Join Column / Key
                  </label>
                  {selectedTargetEntity && selectedTargetEntity.columns && selectedTargetEntity.columns.length > 0 ? (
                    <select
                      value={relToField}
                      onChange={(e) => setRelToField(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                    >
                      <option value="">-- Select Column from {relTarget} --</option>
                      {selectedTargetEntity.columns.map(c => (
                        <option key={c.name} value={c.name}>
                          {c.name} ({c.data_type}) {c.description ? `- ${c.description.slice(0, 30)}...` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. id, customer_code, sku"
                      value={relToField}
                      onChange={(e) => setRelToField(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Condition Predicate <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. status = 'ACTIVE' OR quantity > 0"
                    value={relCondition}
                    onChange={(e) => setRelCondition(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Join Business Rationale
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Explain why and when this join applies for the AI planner..."
                    value={relDesc}
                    onChange={(e) => setRelDesc(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingRel}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  <Plus className="h-4 w-4 text-white" />
                  <span>{isSavingRel ? 'Saving to Memgraph...' : 'Create / Update Relationship'}</span>
                </button>
              </form>
            </div>

            {/* Right: Active Relationships Table */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-slate-900" />
                    <h3 className="text-base font-bold text-slate-900">Active Relational Join Edges ({relationships.length})</h3>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">Type</th>
                        <th className="py-2.5 px-3 font-bold">Source Node & Key</th>
                        <th className="py-2.5 px-3 text-center font-bold">Join</th>
                        <th className="py-2.5 px-3 font-bold">Target Node & Key</th>
                        <th className="py-2.5 px-3 font-bold">Condition / Rationale</th>
                        <th className="py-2.5 px-3 text-right font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {relationships.map((rel, idx) => {
                        const isMust = rel.type === 'MUST_JOIN';
                        const isCond = rel.type === 'CONDITIONAL_JOIN';

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                isMust
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : isCond
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  isMust ? 'bg-rose-600' : isCond ? 'bg-amber-600' : 'bg-emerald-600'
                                }`}></span>
                                {rel.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900">{rel.source}</span>
                              <span className="block font-mono text-[10px] text-slate-600">.{rel.from_field}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-400 font-bold">➔</td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900">{rel.target}</span>
                              <span className="block font-mono text-[10px] text-slate-600">.{rel.to_field}</span>
                            </td>
                            <td className="py-2.5 px-3 max-w-xs truncate" title={rel.desc || rel.condition || ''}>
                              {rel.condition && (
                                <span className="block font-mono text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1 rounded">
                                  WHERE {rel.condition}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-600 truncate block">
                                {rel.desc || 'Direct foreign key link.'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handleDeleteRelationship(rel)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Delete relationship"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Register / Edit Entity & Column Dictionary */}
      {isEntityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl my-8 text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {isEditingEntity ? `Edit Entity: ${entityName}` : 'Register New Database Entity'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Store table business context and column data-type definitions in Memgraph.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEntityModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {/* Row 1: Name, System, Type, PK */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Entity Name</label>
                  <input
                    type="text"
                    placeholder="e.g. customer_orders"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    disabled={isEditingEntity}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Database</label>
                  <select
                    value={entitySystem}
                    onChange={(e) => {
                      const sys = e.target.value;
                      setEntitySystem(sys);
                      if (sys === 'MongoDB') {
                        setEntityType('collection');
                        setEntityPrimaryKey('_id');
                      } else {
                        setEntityType('table');
                        setEntityPrimaryKey('id');
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MongoDB">MongoDB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Entity Type</label>
                  <select
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                  >
                    {entitySystem === 'PostgreSQL' ? (
                      <>
                        <option value="table">Table</option>
                        <option value="view">View</option>
                        <option value="materialized_view">Materialized View</option>
                      </>
                    ) : (
                      <option value="collection">Collection</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Key</label>
                  <input
                    type="text"
                    placeholder="e.g. id, _id"
                    value={entityPrimaryKey}
                    onChange={(e) => setEntityPrimaryKey(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Row 2: Business Meaning / Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Meaning / High-Level Semantic Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain what this table or collection represents in the enterprise domain..."
                  value={entityDescription}
                  onChange={(e) => setEntityDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none resize-none"
                />
              </div>

              {/* Row 3: Column / Field Dictionary Header */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-slate-700" />
                      Column & Field Business Dictionary ({entityColumns.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Store exact data types and semantic comments for each column so the AI never guesses.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleIntrospectColumns}
                      disabled={isIntrospecting}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition shadow-sm"
                      title="Read live table columns and types from PostgreSQL or MongoDB"
                    >
                      <Sparkles className={`h-3.5 w-3.5 text-slate-700 ${isIntrospecting ? 'animate-spin' : ''}`} />
                      <span>{isIntrospecting ? 'Introspecting...' : 'Auto-Introspect from Live DB'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddColumnRow}
                      className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                    >
                      <Plus className="h-3.5 w-3.5 text-white" />
                      <span>Add Column</span>
                    </button>
                  </div>
                </div>

                {/* Columns Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs text-slate-800">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-40 font-bold">Column Name</th>
                        <th className="py-2 px-3 w-32 font-bold">Data Type</th>
                        <th className="py-2 px-3 font-bold">Business Meaning / Comments</th>
                        <th className="py-2 px-2 text-center w-12 font-bold">PK?</th>
                        <th className="py-2 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {entityColumns.map((col, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              placeholder="column_name"
                              value={col.name}
                              onChange={(e) => handleUpdateColumnField(idx, 'name', e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 font-mono focus:border-slate-900 focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              placeholder="data_type"
                              value={col.data_type}
                              onChange={(e) => handleUpdateColumnField(idx, 'data_type', e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 font-mono focus:border-slate-900 focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              placeholder="e.g. 1 = Active buyer, 0 = Suspended"
                              value={col.description}
                              onChange={(e) => handleUpdateColumnField(idx, 'description', e.target.value)}
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-900 focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!col.is_primary_key}
                              onChange={(e) => handleUpdateColumnField(idx, 'is_primary_key', e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-0"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveColumnRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="Remove column"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEntityModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEntity}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
              >
                <Check className="h-4 w-4 text-white" />
                <span>Save Entity & Dictionary</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
