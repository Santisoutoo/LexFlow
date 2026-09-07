interface DashTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
}

/** Recharts tooltip styled to match the app design system. */
export function DashTooltip({ active, payload, label }: DashTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-3 py-2 shadow-lg">
      <div className="label-caps">{label}</div>
      <div className="mt-0.5 font-display text-[13px] font-semibold text-fg tabular-nums">{payload[0]?.value}</div>
    </div>
  );
}
