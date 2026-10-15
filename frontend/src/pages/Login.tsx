import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Database, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      login(res.data.access_token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    setEmail('admin@ginny.ai');
    setPassword('password123');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-cyan-400 shadow-xl shadow-sky-500/25">
            <Database className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">SQL Ginny</h1>
          <p className="mt-1 text-xs text-slate-400">Intelligent Cross-DB Search & Pattern Discovery</p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300">Email Address</label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">Password</label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Demo Account Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleDemoLogin}
            className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-800/40 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-sky-300 transition"
          >
            Fill Demo Admin Credentials (admin@ginny.ai / password123)
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-sky-400 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};
