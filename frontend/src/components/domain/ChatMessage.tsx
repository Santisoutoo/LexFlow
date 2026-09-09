import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as ToolIcon, ChevronRight } from 'lucide-react';
import { Badge, Callout } from '@/components/ui';
import { BrandMark } from '@/components/BrandMark';
import { CitationCard } from './CitationCard';
import { ChatMarkdown } from './ChatMarkdown';
import { useModels } from '@/lib/queries';
import { chatErrorMessage } from '@/lib/errors';
import type { ChatMessage as ChatMessageT, ChatSource } from '@/lib/types';

export interface ChatMessageProps {
  message: ChatMessageT;
  onSourceClick?: (s: ChatSource) => void;
}

/**
 * Audit #409 perf: wrapped with ``memo`` so a stream chunk that only
 * mutates the last assistant message doesn't re-render every prior
 * message in the thread. The default shallow comparison covers our
 * use today; pass a stable ``onSourceClick`` (``useCallback``) to keep
 * the memoisation intact.
 */
function ChatMessageImpl({ message, onSourceClick }: ChatMessageProps) {
  const { t } = useTranslation();
  const { data: models = [] } = useModels();
  const modelLabel = useMemo(() => {
    if (message.role !== 'assistant') return undefined;
    if (message.modelLabel) return message.modelLabel;
    if (!message.model) return undefined;
    const match = models.find((m) => m.id === message.model);
    return match?.label ?? message.model.split(':').slice(-1)[0];
  }, [message, models]);
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[85%]">
        <div className="rounded-[14px_14px_4px_14px] border border-indigo-200/60 bg-primary-soft px-3.5 py-2.5 text-[14.5px] leading-relaxed text-indigo-900 dark:border-indigo-800 dark:text-indigo-100">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === 'tool') {
    return (
      <div className="self-start">
        <div className="inline-flex items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[12.5px]">
          <ToolIcon className="size-3.5 text-muted" />
          <span className="font-semibold text-indigo-600 dark:text-indigo-300">{message.name}</span>
          <span className="text-muted">(</span>
          <span className="text-muted">
            {Object.entries(message.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}
          </span>
          <span className="text-muted">)</span>
          <span className="text-muted">→</span>
          <span>{message.result}</span>
          <ChevronRight className="ml-1 size-3 text-muted" />
        </div>
      </div>
    );
  }
  const modelLabelResolved = message.role === 'assistant' ? modelLabel : undefined;
  return (
    <div className="self-start">
      <div className="mb-2 flex items-center gap-2">
        <BrandMark size={18} />
        <span className="text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-200">LexFlow</span>
        <Badge tone="info" className="text-[11px]">{t('chat.assistantBadge')}</Badge>
        {modelLabelResolved && !message.streaming && (
          <Badge tone="neutral" className="text-[11px] font-mono">{modelLabelResolved}</Badge>
        )}
        {message.corpusDegraded && (
          <Badge tone="amber" className="text-[11px]">{t('chat.degradedNoCorpus')}</Badge>
        )}
        {message.streaming && message.toolActivity && (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-indigo-500" />
            {t(message.toolActivity)}
          </span>
        )}
        {message.streaming && !message.toolActivity && (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-indigo-500" />
            {t('chat.streaming')}
          </span>
        )}
      </div>
      <div className="text-[14.5px] leading-relaxed">
        {message.content.map((p, i) => (
          <ChatMarkdown key={i}>{p}</ChatMarkdown>
        ))}
      </div>
      {message.error && (
        <Callout tone="danger" title={t('chat.errorTitle')} className="mt-3">
          {chatErrorMessage(message.error, t)}
        </Callout>
      )}
      {message.sources.length > 0 && (
        <div className="mt-3.5">
          <div className="label-caps mb-1.5">{t('chat.sources')}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {message.sources.map((s) => (
              <CitationCard
                key={`${s.target?.lawId ?? s.law}::${s.target?.articleNum ?? ''}`}
                source={s}
                onClick={() => onSourceClick?.(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ChatMessage = memo(ChatMessageImpl);
