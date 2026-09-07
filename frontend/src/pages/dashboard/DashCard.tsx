import { TrendingDown, TrendingUp } from 'lucide-react';

import { Badge, Card } from '@/components/ui';
import type { MetricCard } from '@/lib/types';

import { resolveDeltaDisplay } from './delta-tone';
import { Sparkline } from './Sparkline';

interface DashCardProps {
  card: MetricCard;
}

export function DashCard({ card }: DashCardProps) {
  const { tone, showIcon, positive } = resolveDeltaDisplay(card);
  const icon = showIcon
    ? positive
      ? <TrendingUp className="size-3" />
      : <TrendingDown className="size-3" />
    : undefined;

  return (
    <Card className="p-5 transition-shadow hover:shadow-1">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-muted">{card.title}</div>
        <Badge tone={tone} icon={icon} className="font-mono text-[11px]">
          {card.delta}
        </Badge>
      </div>
      <div className="mt-1 font-display text-[28px] font-semibold -tracking-[0.01em] tabular-nums">{card.value}</div>
      <Sparkline data={card.spark} id={card.id} />
    </Card>
  );
}
