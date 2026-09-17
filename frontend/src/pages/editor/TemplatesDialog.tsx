/**
 * TemplatesDialog — the document-template library modal (#600).
 *
 * One modal, two views:
 * - **list**: save the current document as a named template, and browse / apply
 *   / delete saved templates.
 * - **fill**: when an applied template has `{{variables}}`, swap the body for
 *   `TemplateFillForm` to map them (free text + corpus law metadata).
 *
 * Applying inserts the filled draft at the cursor (non-destructive — it never
 * silently wipes the current document). "Aplicar en documento nuevo" mints a
 * fresh document via `createDocument` (#832 / S4.6).
 *
 * --- WHERE TO CHANGE IF TEMPLATE STORAGE CHANGES ---
 * - Persistence → `@/lib/template-store`.
 * - Placeholder discovery / substitution → `./template-utils`.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { LayoutTemplate, FilePlus2, Upload, Trash2, FileText } from 'lucide-react';
import { Button, Kbd } from '@/components/ui';
import { useConfirm } from '@/lib/confirm';
import { useEditorStore } from '@/lib/editor-store';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useTemplateStore } from '@/lib/template-store';
import { stripCommentMarks } from './comment-utils';
import { extractVariables, fillTemplate } from './template-utils';
import { importFile, SUPPORTED_IMPORT } from './import-utils';
import { EMPTY_TEMPLATE_FILL_DRAFT, TemplateFillForm, type TemplateFillDraft } from './TemplateFillForm';

type ApplyMode = 'insert' | 'newDocument';

interface TemplatesDialogProps {
  editor: Editor;
  onClose: () => void;
}

export function TemplatesDialog({ editor, onClose }: TemplatesDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { templates, saveTemplate, deleteTemplate } = useTemplateStore();
  const { createDocument, saveDocument } = useEditorStore();
  const [name, setName] = useState('');
  const [fillId, setFillId] = useState<string | null>(null);
  const [fillDrafts, setFillDrafts] = useState<Record<string, TemplateFillDraft>>({});
  const [applyMode, setApplyMode] = useState<ApplyMode>('insert');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const list = Object.values(templates).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filling = fillId ? templates[fillId] : null;

  useFocusTrap(panelRef, true);

  useEffect(() => {
    if (filling) return;
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [filling]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (fillId) {
        setFillId(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fillId, onClose]);

  const saveCurrent = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTemplate({ id: crypto.randomUUID(), name: trimmed, content: stripCommentMarks(editor.getJSON()) });
    setName('');
  };

  /**
   * Import an uploaded .docx/.md file as a new template (#600). Parsed to the
   * editor's schema so `{{variables}}` in the file are picked up by the fill
   * flow. Resets the input so the same file can be re-selected after an error.
   */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const imported = await importFile(file, editor.schema);
      saveTemplate({ id: crypto.randomUUID(), name: imported.name, content: imported.content });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t('editor.templates.importError'));
    }
  };

  const finishApply = (
    templateName: string,
    content: JSONContent,
    values: Record<string, string>,
    mode: ApplyMode,
  ) => {
    const filled = stripCommentMarks(fillTemplate(content, values));
    if (mode === 'newDocument') {
      const newId = createDocument(templateName);
      saveDocument({ id: newId, title: templateName, content: filled });
      onClose();
      navigate(`/editor/${newId}`);
      return;
    }
    editor.chain().focus().insertContent(filled.content ?? []).run();
    onClose();
  };

  const applyTemplate = (
    templateName: string,
    content: JSONContent,
    values: Record<string, string>,
    mode: ApplyMode,
  ) => {
    finishApply(templateName, content, values, mode);
  };

  const startApply = (id: string, mode: ApplyMode = 'insert') => {
    const template = templates[id];
    if (!template) return;
    setApplyMode(mode);
    if (extractVariables(template.content).length === 0) {
      applyTemplate(template.name, template.content, {}, mode);
      return;
    }
    setFillId(id);
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    const ok = await confirm({
      title: t('editor.templates.deleteConfirmTitle'),
      message: t('editor.templates.deleteConfirmMessage', { name: templateName }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    deleteTemplate(templateId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('editor.templates.dialogAria')}
      className="fixed inset-0 z-overlay flex items-start justify-center pt-[12vh] bg-black/35 backdrop-blur-[2px] animate-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="air-glass-strong w-[580px] max-w-[92vw] overflow-hidden"
      >
        {filling && fillId ? (
          <TemplateFillForm
            template={filling}
            draft={fillDrafts[fillId] ?? EMPTY_TEMPLATE_FILL_DRAFT}
            onDraftChange={(draft) => setFillDrafts((prev) => ({ ...prev, [fillId]: draft }))}
            onBack={() => setFillId(null)}
            onApply={(values) => applyTemplate(filling.name, filling.content, values, applyMode)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <LayoutTemplate className="size-4 text-muted" />
              <span className="flex-1 text-[14.5px] font-semibold">{t('editor.templates.title')}</span>
              <Kbd>esc</Kbd>
            </div>

            {/* Save the current document as a template, or upload one. */}
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveCurrent();
                    }
                  }}
                  aria-label={t('editor.templates.nameAria')}
                  placeholder={t('editor.templates.savePlaceholder')}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13.5px] outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-muted"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FilePlus2 className="size-3.5" />}
                  disabled={!name.trim()}
                  onClick={saveCurrent}
                >
                  {t('editor.templates.save')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload className="size-3.5" />}
                  onClick={() => fileInputRef.current?.click()}
                  title={t('editor.templates.uploadTitle')}
                >
                  {t('editor.templates.upload')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SUPPORTED_IMPORT}
                  onChange={handleUpload}
                  className="hidden"
                  aria-hidden
                />
              </div>
              {importError && <p className="text-[12px] text-danger">{importError}</p>}
            </div>

            {/* Library. */}
            <div className="max-h-[44vh] overflow-auto p-2 scrollbar-thin">
              {list.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted">
                  {t('editor.templates.empty')}
                </div>
              ) : (
                list.map((template) => {
                  const varCount = extractVariables(template.content).length;
                  return (
                    <div
                      key={template.id}
                      className="flex items-center gap-3 rounded px-2.5 py-2 text-[13.5px] transition-colors hover:bg-surface-2"
                    >
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-primary-soft text-indigo-700">
                        <FileText className="size-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={() => startApply(template.id)}
                        className="min-w-0 flex-1 text-left"
                        title={t('editor.templates.applyTitle')}
                      >
                        <div className="truncate font-medium">{template.name}</div>
                        <div className="truncate text-[12px] text-muted">
                          {varCount > 0
                            ? `${varCount} ${varCount === 1 ? t('editor.templates.variable') : t('editor.templates.variables')}`
                            : t('editor.templates.noVariables')}
                        </div>
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => startApply(template.id)}>
                        {t('editor.templates.apply')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startApply(template.id, 'newDocument')}>
                        {t('editor.templates.applyNewDocument')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('editor.templates.deleteAria', { name: template.name })}
                        title={t('editor.templates.delete')}
                        onClick={() => void handleDelete(template.id, template.name)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
