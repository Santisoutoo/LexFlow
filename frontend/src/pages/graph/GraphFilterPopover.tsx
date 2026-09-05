/**
 * Client-side rank/status filters for the subgraph view (#24).
 *
 * Jurisdiction/scope need the global graph endpoint — copy is honest about that.
 */
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

import { Checkbox, Button, Input } from '@/components/ui';
import { RANK_MAP, SCOPE_MAP, STATUS_MAP } from '@/lib/api/transformers';
import { statusLabel } from '@/lib/utils';

const STATUS_OPTIONS = Object.entries(STATUS_MAP).map(([value, label]) => ({ value, label }));
const RANK_OPTIONS = Object.entries(RANK_MAP).map(([value, label]) => ({ value, label }));
const SCOPE_OPTIONS = Object.entries(SCOPE_MAP).map(([value, label]) => ({ value, label }));

export interface GraphAdvancedFilters {
  status: Set<string>;
  rank: Set<string>;
  scope: Set<string>;
  jurisdiction: Set<string>;
}

interface GraphFilterPopoverProps {
  open: boolean;
  filters: GraphAdvancedFilters;
  onChange: (next: GraphAdvancedFilters) => void;
  onClose: () => void;
  /** Global view can send scope/jurisdiction to the server; local cannot. */
  mode?: 'local' | 'global';
}

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * Filter popover for the graph page.
 *
 * Local mode: rank + status, applied client-side on the subgraph.
 * Global mode: also scope + jurisdiction, mapped onto GET /graph query params.
 */
export function GraphFilterPopover({
  open,
  filters,
  onChange,
  onClose,
  mode = 'local',
}: GraphFilterPopoverProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium">{t('graph.advancedFilters')}</span>
        <Button size="icon-sm" variant="ghost" aria-label={t('graph.close')} icon={<X className="size-3.5" />} onClick={onClose} />
      </div>
      <p className="mb-3 text-[11px] text-muted">
        {mode === 'global' ? t('graph.filters.globalHint') : t('graph.filters.subgraphHint')}
      </p>

      <div className="mb-3">
        <div className="label-caps mb-1.5">{t('graph.rail.status')}</div>
        <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <Checkbox
              key={value}
              checked={filters.status.has(value)}
              onChange={() => onChange({ ...filters, status: toggleInSet(filters.status, value) })}
              label={statusLabel(label)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="label-caps mb-1.5">{t('graph.rail.rank')}</div>
        <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
          {RANK_OPTIONS.map(({ value, label }) => (
            <Checkbox
              key={value}
              checked={filters.rank.has(value)}
              onChange={() => onChange({ ...filters, rank: toggleInSet(filters.rank, value) })}
              label={label}
            />
          ))}
        </div>
      </div>

      {mode === 'global' && (
        <>
          <div className="mt-3">
            <div className="label-caps mb-1.5">{t('graph.filters.scope')}</div>
            <div className="flex flex-col gap-1">
              {SCOPE_OPTIONS.map(({ value, label }) => (
                <Checkbox
                  key={value}
                  checked={filters.scope.has(value)}
                  onChange={() => onChange({ ...filters, scope: toggleInSet(filters.scope, value) })}
                  label={label}
                />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <div className="label-caps mb-1.5">{t('graph.filters.jurisdiction')}</div>
            <Input
              className="w-full"
              placeholder="es-md"
              aria-label={t('graph.filters.jurisdiction')}
              value={[...filters.jurisdiction][0] ?? ''}
              onChange={(event) => {
                const next = event.target.value.trim();
                onChange({
                  ...filters,
                  jurisdiction: next ? new Set([next]) : new Set(),
                });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
