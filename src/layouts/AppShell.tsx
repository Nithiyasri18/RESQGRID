import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  FlaskConical,
  GitFork,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu,
  Radio,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { useScenario } from '../app/ScenarioContext';
import { formatTimestamp } from '../lib/format';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: Activity },
  { to: '/map', label: 'Chennai Map', icon: MapIcon },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/routes', label: 'Route Optimizer', icon: Compass },
  { to: '/dispatch', label: 'Rescue Dispatch', icon: GitFork },
  { to: '/scenarios', label: 'Scenarios', icon: FlaskConical },
  { to: '/analytics', label: 'DAA Analytics', icon: BarChart3 },
  { to: '/portal', label: 'Citizen Portal', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Command Center Overview',
  '/map': 'Chennai Study-Area Disaster Map',
  '/incidents': 'Incident Operations',
  '/routes': 'DAA Route Optimization',
  '/dispatch': 'Multi-Incident Rescue Dispatch',
  '/scenarios': 'Scenario Laboratory',
  '/analytics': 'DAA Performance Analytics',
  '/portal': 'Citizen & Volunteer Portal',
  '/settings': 'System & Study-Area Settings',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { scenarios, activeScenario, setSelectedScenarioId, auditEvents, sseConnected } = useScenario();

  const pageTitle = ROUTE_TITLES[location.pathname] || 'RESQGRID';

  return (
    <div className="min-h-screen flex bg-[#070D19] text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-slate-800/80 bg-[#0A1120] transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800/80">
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-md bg-teal-600/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            {!collapsed && (
              <span className="font-display font-bold text-base tracking-tight text-slate-100 whitespace-nowrap">
                RESQGRID
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-500/12 text-teal-300 border border-teal-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="p-3 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center justify-between">
              <span>Simulation Scope</span>
              <span className="font-mono text-teal-400">DAA Capstone</span>
            </div>
            <p className="text-slate-500 leading-snug">
              Academic simulation only. Not a live emergency dispatch service.
            </p>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#0A1120] border-r border-slate-800 flex flex-col h-full z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
              <span className="font-display font-bold text-base text-slate-100">RESQGRID</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                        isActive
                          ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                          : 'text-slate-300 hover:bg-slate-800/50'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-slate-800/80 bg-[#0A1120]/90 backdrop-blur-sm px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
              <span className="hidden sm:inline text-slate-500">RESQGRID</span>
              <span className="hidden sm:inline text-slate-600">/</span>
              <span className="font-medium text-slate-100 truncate">{pageTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Active Simulation Switcher */}
            {scenarios.length > 0 && (
              <div className="hidden md:flex items-center gap-2 rounded-md border border-slate-800 bg-[#070D19] px-2.5 py-1">
                <span className="text-[11px] font-medium text-amber-400 whitespace-nowrap">
                  Simulated Scenario:
                </span>
                <select
                  aria-label="Select active simulation scenario"
                  value={activeScenario?.id || ''}
                  onChange={(e) => setSelectedScenarioId(e.target.value)}
                  className="bg-transparent text-xs text-slate-200 focus:outline-none max-w-[210px] truncate"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#0E1729] text-slate-100">
                      {s.name} {s.is_active === 1 ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Real SSE Live Stream Indicator */}
            <div
              title={sseConnected ? 'Server-Sent Events connected' : 'Reconnecting SSE stream'}
              className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#070D19] px-2 py-1 text-[11px] text-slate-400 whitespace-nowrap"
            >
              <Radio className={`w-3 h-3 ${sseConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span>{sseConnected ? 'Live Sync' : 'Syncing'}</span>
            </div>

            {/* Real Audit Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Toggle audit activity notifications"
                className="relative p-2 rounded-md border border-slate-800 bg-[#070D19] text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {auditEvents.length > 0 && (
                  <span className="sr-only">{auditEvents.length} audit records</span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-700 bg-[#0E1729] shadow-2xl z-50 overflow-hidden">
                  <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-teal-400" />
                      Recent Audit Events
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/70">
                    {auditEvents.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400 text-center">
                        No audit events recorded yet.
                      </p>
                    ) : (
                      auditEvents.slice(0, 8).map((ev) => (
                        <div key={ev.id} className="px-3.5 py-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-200 truncate">
                              {ev.action.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                              {formatTimestamp(ev.created_at)}
                            </span>
                          </div>
                          <p className="text-slate-400 mt-0.5 truncate">
                            {ev.actor_name} · {ev.entity_type} ({ev.entity_id})
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Auth Menu */}
            {user ? (
              <div className="flex items-center gap-2 pl-1">
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-xs font-medium text-slate-200 max-w-[140px] truncate">
                    {user.displayName}
                  </p>
                  <p className="text-[11px] text-teal-400 capitalize">{user.role}</p>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  title="Sign out"
                  aria-label="Sign out"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#070D19] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 hover:bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
