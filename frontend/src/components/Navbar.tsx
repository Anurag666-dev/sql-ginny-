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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 shadow-sm">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                SQL Ginny
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  FastMCP
                </span>
              </span>
              <p className="text-[11px] font-medium text-slate-500">Cross-DB Intelligence Engine</p>
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
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
              className="relative flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-sm"
              title="Inspect active Redis query cache and confirm results"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Query Preview & Confirm</span>
              {activePreviewId && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
              )}
            </button>
          )}

          {/* User info */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-800">{user?.name}</span>
            <span className="text-[10px] font-medium text-slate-500">{user?.email}</span>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
