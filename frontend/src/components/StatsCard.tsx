import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  colorScheme?: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate';
  prefix?: string;
  onClick?: () => void;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  colorScheme = 'slate',
  prefix = '฿',
  onClick
}: StatsCardProps) {
  const schemeStyles = {
    emerald: {
      bg: 'bg-emerald-50 text-emerald-600',
      border: 'hover:border-emerald-350',
    },
    amber: {
      bg: 'bg-amber-50 text-amber-600',
      border: 'hover:border-amber-350',
    },
    blue: {
      bg: 'bg-blue-50 text-blue-600',
      border: 'hover:border-blue-350',
    },
    rose: {
      bg: 'bg-rose-50 text-rose-600',
      border: 'hover:border-rose-350',
    },
    slate: {
      bg: 'bg-slate-50 text-slate-600',
      border: 'hover:border-slate-350',
    }
  };

  const currentStyles = schemeStyles[colorScheme];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 transition-all flex items-center space-x-4 ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${currentStyles.border}`}
    >
      <div className={`p-3 rounded-xl ${currentStyles.bg}`}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
          {title}
        </span>
        <h4 className="text-2xl font-bold text-slate-800 mt-1">
          {typeof value === 'number' ? `${prefix}${value.toLocaleString()}` : value}
        </h4>
      </div>
    </div>
  );
}
