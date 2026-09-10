/**
 * Shared error message resolution (issue #43).
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * New backend code  → add key under `errors.*` in i18n + optional fallback below.
 * ApiError transport  → `lib/api/http.ts`
 */

import type { TFunction } from 'i18next';

import { ApiError } from './api/http';
import { looksLikeHttpPath, parseApiErrorBody } from './api/error-body';

export { looksLikeHttpPath, parseApiErrorBody } from './api/error-body';

const NETWORK_ERROR = /^(Failed to fetch|NetworkError|Load failed)/i;
const FALLBACK_MESSAGES: Record<string, string> = {
  internal_error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
  rate_limited: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  rate_limited_short: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  law_not_found: 'No se encontró la norma solicitada.',
  article_not_found: 'No se encontró el artículo solicitado.',
  parser_error: 'Error al procesar un fichero legal.',
  data_unavailable: 'El corpus legal no está disponible.',
  semantic_warming: 'El índice semántico se está preparando. Inténtalo en unos segundos.',
  validation_error: 'La petición no es válida.',
  'http.400': 'Petición inválida.',
  'http.422': 'La petición no es válida. Revisa los datos e inténtalo de nuevo.',
  'http.429': 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
  'http.500': 'Error del servidor. Inténtalo de nuevo más tarde.',
  network: 'No se pudo conectar con el servidor.',
  unknown: 'Ha ocurrido un error desconocido.',
  stream_idle_timeout: 'La respuesta del asistente tardó demasiado. Inténtalo de nuevo.',
};

function translateKey(key: string, t?: TFunction, opts?: Record<string, unknown>): string {
  const fullKey = key.startsWith('errors.') ? key : `errors.${key}`;
  if (t) {
    const translated = t(fullKey, opts);
    if (translated !== fullKey) return translated;
  }
  return FALLBACK_MESSAGES[key] ?? FALLBACK_MESSAGES.unknown;
}

function statusFallback(status: number, t?: TFunction, retryAfterS?: number | null): string {
  if (status === 400) return translateKey('http.400', t);
  if (status === 422) return translateKey('http.422', t);
  if (status === 429) {
    return translateKey('rate_limited', t, retryAfterS != null ? { seconds: retryAfterS } : undefined);
  }
  if (status >= 500) return translateKey('http.500', t);
  return translateKey('unknown', t);
}

/**
 * Resolve any thrown value to a lawyer-facing message.
 * Never returns an HTTP method+path placeholder.
 */
export function errorMessage(err: unknown, t?: TFunction): string {
  if (err instanceof ApiError) {
    const parsed = parseApiErrorBody(err.body);
    const code = err.code ?? parsed.code;
    if (code) {
      const opts = parsed.retryAfterS != null ? { seconds: parsed.retryAfterS } : undefined;
      const rateKey = code === 'rate_limited' && opts?.seconds == null ? 'rate_limited_short' : code;
      const keyed = translateKey(rateKey, t, opts);
      if (keyed !== rateKey && keyed !== `errors.${rateKey}`) return keyed;
    }
    const detail = err.detail || parsed.detail;
    if (detail && !looksLikeHttpPath(detail)) return detail;
    return statusFallback(err.status, t, parsed.retryAfterS);
  }

  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return translateKey('network', t);
  }

  if (err instanceof Error && err.message && !looksLikeHttpPath(err.message)) {
    if (NETWORK_ERROR.test(err.message)) return translateKey('network', t);
    if (err.message === 'stream_idle_timeout') return translateKey('stream_idle_timeout', t);
    return err.message;
  }

  return translateKey('network', t);
}

/** Resolve a persisted or in-stream chat error to a localized message. */
export function chatErrorMessage(error: { detail: string; code?: string }, t: TFunction): string {
  if (error.code) {
    const key = `chat.errors.${error.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  if (error.detail && !looksLikeHttpPath(error.detail)) return error.detail;
  return t('chat.errors.provider_error');
}
