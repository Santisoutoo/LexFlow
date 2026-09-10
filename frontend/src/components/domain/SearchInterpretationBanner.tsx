import { useTranslation } from 'react-i18next';
import type { AliasExpansion } from '@/lib/types';

interface SearchInterpretationBannerProps {
  aliasExpansions?: AliasExpansion[];
  className?: string;
}

/** Surfaces token-wise acronym expansions above search results (#47). */
export function SearchInterpretationBanner({ aliasExpansions, className }: SearchInterpretationBannerProps) {
  const { t } = useTranslation();
  if (!aliasExpansions?.length) return null;

  return (
    <div className={className}>
      {aliasExpansions.map((item) => (
        <p key={`${item.token}-${item.expansion}`} className="text-[12.5px] text-muted">
          {t('search.interpretation.alias', { token: item.token, expansion: item.expansion })}
        </p>
      ))}
    </div>
  );
}
