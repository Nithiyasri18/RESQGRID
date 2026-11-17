import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, UserCheck, Eye, ArrowRight } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import type { UserRole } from '../types/resqgrid';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login, register, demoLogin } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        pushToast('Signed in', 'Authenticated session active.', 'success');
      } else {
        await register(displayName, email, password);
        pushToast('Account created', 'Registered with read-only viewer permissions.', 'success');
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async (role: UserRole) => {
    setError(null);
    setBusy(true);
    try {
      await demoLogin(role);
      pushToast('Demo session started', `Signed in with ${role} role.`, 'success');
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo sign-in unavailable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D19] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-xl border border-slate-800/90 bg-[#0E1729] overflow-hidden shadow-2xl">
        {/* Left Context Column */}
        <div className="lg:col-span-5 bg-[#0A1120] p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-slate-800/80 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-md bg-teal-600/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight">RESQGRID</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-100 mt-5 text-balance">
              Chennai Emergency Rescue Routing &amp; Dispatch Simulator
            </h1>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Academic Design &amp; Analysis of Algorithms (DAA) capstone prototype evaluating BFS,
              DFS, Dijkstra, A*, Greedy matching, and Lexicographic Min-Cost Max-Flow on a Chennai
              metropolitan study-area road graph.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-300">Academic Evaluation Quick Access</p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDemo('admin')}
                className="w-full flex items-center justify-between rounded-md border border-teal-500/30 bg-teal-950/30 hover:bg-teal-950/60 px-3.5 py-2.5 text-left transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    Demo Admin Session
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Verify incidents, edit road closures, approve dispatch
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleDemo('dispatcher')}
                className="w-full flex items-center justify-between rounded-md border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800/80 px-3.5 py-2.5 text-left transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-sky-400" />
                    Demo Dispatcher Session
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Run route/dispatch optimization and manage team statuses
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleDemo('viewer')}
                className="w-full flex items-center justify-between rounded-md border border-slate-800 bg-[#070D19] hover:bg-slate-900 px-3.5 py-2.5 text-left transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    Demo Faculty Viewer (Read-Only)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Inspect maps, run DAA route comparisons, view analytics
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              All incidents, hazards, and travel times are simulated. Not a live emergency response service.
            </p>
          </div>
        </div>

        {/* Right Form Column */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#070D19] border border-slate-800 w-fit mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'login' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'register' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register Viewer
            </button>
          </div>

          <h2 className="text-lg font-semibold text-slate-100">
            {mode === 'login' ? 'Sign in to RESQGRID' : 'Create a Viewer Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'login'
              ? 'Authenticate with your seeded account or use an academic evaluation session.'
              : 'New registrations receive read-only viewer permissions enforced server-side.'}
          </p>

          {error && (
            <div className="mt-4 rounded-md border border-red-800/70 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Dr. S. Ramanathan"
                  className="w-full rounded-md border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@resqgrid.local"
                className="w-full rounded-md border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-md border border-slate-700 bg-[#070D19] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              {busy ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Public citizen test reporting available without admin sign-in</span>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="text-teal-400 hover:text-teal-300 font-medium whitespace-nowrap"
            >
              Open Citizen Portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
