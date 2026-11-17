import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'neutral' | 'critical' | 'warning' | 'success' | 'accent';
  icon?: React.ReactNode;
}

const TONE_TEXT: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-slate-100',
  critical: 'text-red-400',
  warning: 'text-amber-400',
  success: 'text-emerald-400',
  accent: 'text-teal-400',
};

export function StatCard({ label, value, sublabel, tone = 'neutral', icon }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-800/90 bg-[#0E1729] p-4 flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400 truncate">{label}</span>
        {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
      </div>
      <div className={`text-2xl font-semibold tracking-tight tabular-nums font-mono ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sublabel && <p className="text-xs text-slate-400 truncate">{sublabel}</p>}
    </div>
  );
}
