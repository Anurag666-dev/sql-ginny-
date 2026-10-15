import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, CheckCircle, AlertTriangle, Download, Clock, RefreshCw, Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface QueryPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialResultId?: string | null;
}

export const QueryPreviewModal: React.FC<QueryPreviewModalProps> = ({
  isOpen,
  onClose,
  initialResultId,
}) => {
  const [resultId, setResultId] = useState<string>(initialResultId || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialResultId) {
      setResultId(initialResultId);
      fetchPreview(initialResultId);
    }
  }, [initialResultId]);

  if (!isOpen) return null;

  const fetchPreview = async (idToFetch: string) => {
    const cleanId = idToFetch.trim();
    if (!cleanId) return;
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await axios.get(`${API_URL}/api/preview/${cleanId}`);
      setPreviewData(res.data);
    } catch (err: any) {
      setPreviewData(null);
      setError(err.response?.data?.detail || 'Failed to fetch query preview. May have expired after 10-min TTL.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData?.result_id) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/preview/action`, {
        result_id: previewData.result_id,
        action: 'confirm',
      });
      setActionMessage(res.data.message);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to confirm query.');
    } finally {
      setLoading(false);
    }
  };

  const handleCorrection = async () => {
    if (!previewData?.result_id) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/preview/action`, {
        result_id: previewData.result_id,
        action: 'correction',
      });
      setPreviewData(null);
      setActionMessage('Cache invalidated: Query results cleared from Redis. Prompt AI for revision.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to clear query cache.');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (format: 'csv' | 'json') => {
    if (!previewData?.result_id) return;
    window.open(`${API_URL}/api/preview/${previewData.result_id}/download?format=${format}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Query Results Confirmation & Preview</h2>
              <p className="text-xs text-slate-400">Redis 10-minute TTL result verification before full export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Bar for Result ID */}
        <div className="flex items-center gap-3 border-b border-slate-800/80 bg-slate-950/40 px-6 py-3">
          <input
            type="text"
            placeholder="Enter Query Result ID (e.g. 84ab21cd)..."
            value={resultId}
            onChange={(e) => setResultId(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            onClick={() => fetchPreview(resultId)}
            disabled={loading || !resultId.trim()}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Load Result
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {actionMessage && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{actionMessage}</span>
            </div>
          )}

          {previewData ? (
            <div className="space-y-4">
              {/* Meta statistics bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Result ID</span>
                  <p className="mt-1 font-mono text-sm font-semibold text-sky-400">{previewData.result_id}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Records</span>
                  <p className="mt-1 text-sm font-semibold text-emerald-400">{previewData.total_records}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Source</span>
                  <p className="mt-1 text-sm font-semibold text-indigo-400">{previewData.metadata?.source || 'Cross-DB'}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="h-3 w-3 text-amber-400" />
                    TTL Remaining
                  </span>
                  <p className="mt-1 font-mono text-sm font-semibold text-amber-400">
                    {Math.floor(previewData.ttl_seconds_remaining / 60)}m {previewData.ttl_seconds_remaining % 60}s
                  </p>
                </div>
              </div>

              {/* Top 5 Preview Table */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Top 5 Preview Entries (Confirmation View)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Showing {previewData.preview_records?.length} of {previewData.total_records} rows
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                      <tr>
                        {previewData.preview_records?.[0] &&
                          Object.keys(previewData.preview_records[0]).map((key) => (
                            <th key={key} className="px-3.5 py-2.5 font-semibold text-slate-300">
                              {key}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono text-[11px]">
                      {previewData.preview_records?.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/40 transition">
                          {Object.values(row).map((val: any, cIdx: number) => (
                            <td key={cIdx} className="px-3.5 py-2 truncate max-w-xs">
                              {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  onClick={handleCorrection}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Say Correction (Clear from Cache)
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-500/20"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Confirm Correct
                  </button>
                  <button
                    onClick={() => downloadFile('csv')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-sky-400" />
                    Download CSV
                  </button>
                  <button
                    onClick={() => downloadFile('json')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                  >
                    <Download className="h-3.5 w-3.5 text-indigo-400" />
                    Download JSON
                  </button>
                </div>
              </div>
            </div>
          ) : (
            !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                <Clock className="h-10 w-10 text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-300">No active result loaded</p>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Enter a result ID from an AI query response above or click Load Result to preview cached records.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
