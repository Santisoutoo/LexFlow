import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { CHART_PRIMARY, CHART_THEME } from './chart-theme';

interface SparklineProps {
  data: number[];
  id: string;
}

export function Sparkline({ data, id }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  const gradId = `spark-${id}`;
  const { margin, area } = CHART_THEME;
  return (
    <div className="mt-3 h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={margin.spark}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={area.spark.gradientTop.stopColor} stopOpacity={area.spark.gradientTop.stopOpacity} />
              <stop offset="100%" stopColor={area.spark.gradientBottom.stopColor} stopOpacity={area.spark.gradientBottom.stopOpacity} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={CHART_PRIMARY}
            strokeWidth={area.spark.strokeWidth}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
