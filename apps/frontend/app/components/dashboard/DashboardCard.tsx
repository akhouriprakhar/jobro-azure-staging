'use client';

import { LucideIcon } from 'lucide-react';

interface DashboardCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  description?: string;
}

export default function DashboardCard({ label, value, icon: Icon, description }: DashboardCardProps) {
  return (
    <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs uppercase tracking-[0.25em] text-[#5C6485] font-bold">{label}</p>
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/10">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-6 text-4xl font-extrabold text-[#150E56]">{value}</p>
      <p className="mt-3 text-xs leading-relaxed text-[#5C6485]">
        {description || 'Enterprise-grade monitoring for permissions and operations.'}
      </p>
    </div>
  );
}
