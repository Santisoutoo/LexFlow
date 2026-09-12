/**
 * Document picker list for the editor (#57 S1.4).
 *
 * Sidebar on desktop, compact top section on mobile. Create persists
 * immediately via the editor store, then the caller navigates to the new id.
 *
 * WHERE TO CHANGE IF X CHANGES: store actions live in `lib/editor-store.ts`.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FilePlus, FileText } from 'lucide-react';
import { listDocuments, useEditorStore } from '@/lib/editor-store';
import { cn, timeAgo } from '@/lib/utils';

export function DocumentPicker() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{t('editor.documents')}</h1>
        <p className="mt-1 text-[13px] text-muted">{t('editor.pickDocument')}</p>
      </header>
      <DocumentList />
    </div>
  );
}

export function DocumentList({ activeId }: { activeId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const documents = useEditorStore((s) => s.documents);
  const createDocument = useEditorStore((s) => s.createDocument);
  const docs = useMemo(() => listDocuments(documents), [documents]);

  const handleCreate = () => {
    const id = createDocument(t('editor.untitled'));
    navigate(`/editor/${id}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleCreate}
        className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2"
      >
        <FilePlus className="size-3.5" />
        {t('editor.newDocument')}
      </button>
      {docs.length === 0 ? (
        <p className="text-[13px] text-muted">{t('editor.noDocuments')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {docs.map((doc) => {
            const active = doc.id === activeId;
            return (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/editor/${doc.id}`)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                    active ? 'bg-primary-soft text-indigo-700 dark:text-indigo-200' : 'hover:bg-surface-2',
                  )}
                >
                  <FileText className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{doc.title.trim() || t('editor.untitled')}</span>
                    <span className="block text-[11px] text-muted">{timeAgo(doc.updatedAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
