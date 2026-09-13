import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';
import { useSyncStatus } from '@/lib/queries';
import { lawStatusTone } from '@/lib/law-status';
import type { LawStatus } from '@/lib/types';
import { formatDate, statusLabel } from '@/lib/utils';

export interface LawStatusBadgeProps {
  status: LawStatus;
  className?: string;
}

/** Status chip with corpus provenance tooltip (legalize-es sync + BOE caveat). */
export function LawStatusBadge({ status, className }: LawStatusBadgeProps) {
  const { t } = useTranslation();
  const { data: sync } = useSyncStatus();
  const tooltip = t('law.statusTooltip', { date: formatDate(sync?.lastSyncAt) });

  return (
    <Badge
      tone={lawStatusTone(status)}
      className={className}
      title={tooltip}
      aria-label={tooltip}
    >
      {statusLabel(status)}
    </Badge>
  );
}
