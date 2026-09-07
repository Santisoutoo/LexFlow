import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_PRIMARY, CHART_THEME } from './chart-theme';
import { DashTooltip } from './DashTooltip';

interface HeroDatum {
  label: string;
  value: number;
}

interface BigChartProps {
  values: number[];
  labels: string[];
  recentFrom?: number;
}

export function BigChart({ values, labels, recentFrom = 0 }: BigChartProps) {
  const chartData: HeroDatum[] = values.map((v, i) => ({ label: labels[i], value: v }));
  const recentLabel = labels[recentFrom];
  const lastLabel = labels[labels.length - 1];
  const { margin, tick, grid, cursor, area, referenceArea, recentTint } = CHART_THEME;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={margin.hero}>
          <defs>
            <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={area.hero.gradientTop.stopColor} stopOpacity={area.hero.gradientTop.stopOpacity} />
              <stop offset="95%" stopColor={area.hero.gradientBottom.stopColor} stopOpacity={area.hero.gradientBottom.stopOpacity} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray={grid.strokeDasharray} stroke={grid.stroke} vertical={grid.vertical} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={tick} />
          <YAxis width={40} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip content={<DashTooltip />} cursor={cursor} />
          {recentLabel && lastLabel && recentFrom < values.length && (
            <ReferenceArea
              x1={recentLabel}
              x2={lastLabel}
              fill={recentTint}
              fillOpacity={referenceArea.fillOpacity}
              strokeOpacity={referenceArea.strokeOpacity}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_PRIMARY}
            strokeWidth={area.hero.strokeWidth}
            fill="url(#hero-grad)"
            dot={area.hero.dot}
            activeDot={area.hero.activeDot}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
