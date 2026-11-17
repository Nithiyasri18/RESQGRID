import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

type BadgeVariant =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'verified'
  | 'unverified'
  | 'rejected'
  | 'open'
  | 'restricted'
  | 'blocked'
  | 'available'
  | 'assigned'
  | 'en_route'
  | 'on_scene'
  | 'offline'
  | 'proposed'
  | 'approved'
  | 'dispatched'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'resolved'
  | 'closed'
  | 'neutral';

const VARIANT_CONFIG: Record<
  string,
  { cls: string; label: string; icon: 'critical' | 'warn' | 'ok' | 'info' | 'x' }
> = {
  critical: { cls: 'border-red-500/40 bg-red-950/50 text-red-300', label: 'Critical', icon: 'critical' },
  high: { cls: 'border-amber-500/40 bg-amber-950/40 text-amber-300', label: 'High', icon: 'warn' },
  medium: { cls: 'border-sky-500/40 bg-sky-950/40 text-sky-300', label: 'Medium', icon: 'info' },
  low: { cls: 'border-slate-600/50 bg-slate-800/60 text-slate-300', label: 'Low', icon: 'info' },
  verified: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'Verified', icon: 'ok' },
  unverified: { cls: 'border-amber-500/40 bg-amber-950/40 text-amber-300', label: 'Unverified', icon: 'warn' },
  rejected: { cls: 'border-red-500/40 bg-red-950/40 text-red-300', label: 'Rejected', icon: 'x' },
  open: { cls: 'border-teal-500/40 bg-teal-950/40 text-teal-300', label: 'Open', icon: 'info' },
  restricted: { cls: 'border-amber-500/40 bg-amber-950/40 text-amber-300', label: 'Restricted', icon: 'warn' },
  blocked: { cls: 'border-red-500/40 bg-red-950/50 text-red-300', label: 'Blocked', icon: 'x' },
  available: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'Available', icon: 'ok' },
  assigned: { cls: 'border-sky-500/40 bg-sky-950/40 text-sky-300', label: 'Assigned', icon: 'info' },
  en_route: { cls: 'border-teal-500/40 bg-teal-950/40 text-teal-300', label: 'En Route', icon: 'info' },
  on_scene: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'On Scene', icon: 'ok' },
  offline: { cls: 'border-slate-700 bg-slate-900 text-slate-400', label: 'Offline', icon: 'x' },
  proposed: { cls: 'border-slate-600 bg-slate-800/70 text-slate-200', label: 'Proposed', icon: 'info' },
  approved: { cls: 'border-teal-500/40 bg-teal-950/40 text-teal-300', label: 'Approved', icon: 'ok' },
  dispatched: { cls: 'border-sky-500/40 bg-sky-950/40 text-sky-300', label: 'Dispatched', icon: 'info' },
  arrived: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'Arrived', icon: 'ok' },
  completed: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'Completed', icon: 'ok' },
  cancelled: { cls: 'border-slate-700 bg-slate-900 text-slate-400', label: 'Cancelled', icon: 'x' },
  resolved: { cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300', label: 'Resolved', icon: 'ok' },
  closed: { cls: 'border-slate-700 bg-slate-900 text-slate-400', label: 'Closed', icon: 'x' },
  neutral: { cls: 'border-slate-700 bg-slate-900 text-slate-300', label: 'Info', icon: 'info' },
};

export function StatusBadge({
  value,
  label,
}: {
  value: BadgeVariant | string;
  label?: string;
}) {
  const cfg = VARIANT_CONFIG[value] ?? VARIANT_CONFIG.neutral;
  const text = label || cfg.label || value;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${cfg.cls}`}
    >
      {cfg.icon === 'critical' && <AlertOctagon className="w-3 h-3 shrink-0" />}
      {cfg.icon === 'warn' && <AlertTriangle className="w-3 h-3 shrink-0" />}
      {cfg.icon === 'ok' &&
        (value === 'verified' ? (
          <ShieldCheck className="w-3 h-3 shrink-0" />
        ) : (
          <CheckCircle2 className="w-3 h-3 shrink-0" />
        ))}
      {cfg.icon === 'info' &&
        (value === 'proposed' ? (
          <Clock className="w-3 h-3 shrink-0" />
        ) : value === 'unverified' ? (
          <ShieldAlert className="w-3 h-3 shrink-0" />
        ) : (
          <Info className="w-3 h-3 shrink-0" />
        ))}
      {cfg.icon === 'x' && <XCircle className="w-3 h-3 shrink-0" />}
      <span>{text}</span>
    </span>
  );
}
