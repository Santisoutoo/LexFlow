import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from '@/i18n';

/** Conditional + merged Tailwind class string. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map the active i18n language to an Intl locale tag. */
export function getIntlLocale(): string {
  return i18n.language?.startsWith('en') ? 'en-GB' : 'es-ES';
}

// Audit #409 perf: hoist formatters per locale; refresh on language change.
let dateFmt = new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
let numberFmt = new Intl.NumberFormat(getIntlLocale());
let relativeTimeFmt = new Intl.RelativeTimeFormat(getIntlLocale(), { numeric: 'auto' });

function refreshFormatters(): void {
  const locale = getIntlLocale();
  dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  numberFmt = new Intl.NumberFormat(locale);
  relativeTimeFmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
}

i18n.on('languageChanged', refreshFormatters);

/** Format an ISO date as e.g. "11 may 2023". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return dateFmt.format(new Date(iso));
  } catch { return iso; }
}

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** Distance-from-now in human language ("hace 14 minutos" / "14 minutes ago"). */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = relativeTimeFmt;
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

/** Group an array by a key function. */
export function groupBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

/** Detect the macOS modifier label so we can show ⌘ vs Ctrl correctly. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Localise a status enum value. */
export function statusLabel(status: string): string {
  return ({
    vigente: 'Vigente',
    modificada: 'Derogada parcialmente',
    derogada: 'Derogada',
    pendiente: 'Pendiente',
    desconocido: 'Desconocido',
  } as Record<string, string>)[status] || status;
}
