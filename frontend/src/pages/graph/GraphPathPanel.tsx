/**
 * Path finder between two law ids — surfaces GET /api/v1/graph/path.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Search } from 'lucide-react';

import { Button, Chip, Input } from '@/components/ui';

interface GraphPathPanelProps {
  from: string;
  to: string;
  path: string[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onSubmit: (from: string, to: string) => void;
  onSelectHop: (lawId: string) => void;
  outsideView: boolean;
}

/**
 * Collapsible path-finder: two BOE ids in, ordered hops out.
 */
export function GraphPathPanel({
  from,
  to,
  path,
  isLoading,
  isError,
  onSubmit,
  onSelectHop,
  outsideView,
}: GraphPathPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(from && to));
  const [fromDraft, setFromDraft] = useState(from);
  const [toDraft, setToDraft] = useState(to);

  useEffect(() => {
    setFromDraft(from);
    setToDraft(to);
  }, [from, to]);

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant={open ? 'secondary' : 'ghost'}
        icon={<Route className="size-3.5" />}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {t('graph.path.title')}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(fromDraft.trim(), toDraft.trim());
            }}
          >
            <Input
              className="w-full"
              placeholder={t('graph.path.fromPlaceholder')}
              aria-label={t('graph.path.from')}
              value={fromDraft}
              onChange={(event) => setFromDraft(event.target.value)}
            />
            <Input
              className="w-full"
              placeholder={t('graph.path.toPlaceholder')}
              aria-label={t('graph.path.to')}
              value={toDraft}
              onChange={(event) => setToDraft(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              icon={<Search className="size-3.5" />}
              disabled={!fromDraft.trim() || !toDraft.trim() || isLoading}
            >
              {isLoading ? t('graph.path.searching') : t('graph.path.find')}
            </Button>
          </form>
          {isError && <p className="mt-2 text-[12px] text-danger">{t('graph.path.notFound')}</p>}
          {outsideView && path && path.length > 0 && (
            <p className="mt-2 text-[12px] text-muted">{t('graph.path.outsideView')}</p>
          )}
          {path && path.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {path.map((lawId) => (
                <Chip key={lawId} onClick={() => onSelectHop(lawId)} className="font-mono text-[11px]">
                  {lawId}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
