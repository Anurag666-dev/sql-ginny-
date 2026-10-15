import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Database, Network, BookOpen, MessageSquare, LogOut, CheckCircle2, Layers } from 'lucide-react';

interface NavbarProps {
  onOpenPreviewModal?: () => void;
  activePreviewId?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenPreviewModal, activePreviewId }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'AI Chat', icon: MessageSquare },
    { to: '/visualize-db', label: 'Database Visualizer', icon: Network },
    { to: '/business-structs', label: 'Business RAG', icon: BookOpen },
    { to: '/schema-studio', label: 'Schema Studio', icon: Layers },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-cyan-400 shadow-lg shadow-sky-500/20">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                SQL Ginny
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20">
                  FastMCP
                </span>
              </span>
              <p className="text-[11px] text-slate-400">Cross-DB Intelligence</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="ml-8 hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-400 shadow-sm border border-sky-500/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Action Controls & User */}
        <div className="flex items-center gap-3">
          {/* Query Preview Trigger Button */}
          {onOpenPreviewModal && (
            <button
              onClick={onOpenPreviewModal}
              className="relative flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/60 transition shadow-sm"
              title="Inspect active Redis query cache and confirm results"
            >
              <CheckCircle2 className="h-4 w-4 text-indigo-400" />
              <span>Query Preview & Confirm</span>
              {activePreviewId && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </button>
          )}

          {/* User info */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-200">{user?.name}</span>
            <span className="text-[10px] text-slate-400">{user?.email}</span>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
