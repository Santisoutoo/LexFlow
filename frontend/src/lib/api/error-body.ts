/**
 * Parse FastAPI error response bodies into detail + code (issue #43).
 */

const HTTP_METHOD_PATH = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;

/** True when a string looks like fetch's ``"GET /path"`` placeholder. */
export function looksLikeHttpPath(message: string): boolean {
  return HTTP_METHOD_PATH.test(message);
}

export interface ParsedApiBody {
  detail: string;
  code: string | null;
  retryAfterS: number | null;
}

/** Extract human detail + machine code from any known FastAPI error body. */
export function parseApiErrorBody(body: unknown): ParsedApiBody {
  if (!body || typeof body !== 'object') {
    return { detail: '', code: null, retryAfterS: null };
  }
  const obj = body as Record<string, unknown>;
  const topCode = typeof obj.code === 'string' ? obj.code : null;

  if (!('detail' in obj)) {
    return { detail: '', code: topCode, retryAfterS: null };
  }

  const rawDetail = obj.detail;
  if (typeof rawDetail === 'string') {
    return { detail: rawDetail, code: topCode, retryAfterS: null };
  }

  if (Array.isArray(rawDetail) && rawDetail.length > 0) {
    const first = rawDetail[0];
    if (first && typeof first === 'object' && 'msg' in first) {
      const msg = (first as { msg?: unknown }).msg;
      if (typeof msg === 'string') {
        return { detail: msg, code: topCode ?? 'validation_error', retryAfterS: null };
      }
    }
    return { detail: '', code: topCode, retryAfterS: null };
  }

  if (rawDetail && typeof rawDetail === 'object') {
    const nested = rawDetail as Record<string, unknown>;
    const message = typeof nested.message === 'string' ? nested.message : '';
    const nestedCode =
      typeof nested.code === 'string'
        ? nested.code
        : typeof nested.error === 'string'
          ? nested.error
          : topCode;
    const retryAfterS = typeof nested.retry_after_s === 'number' ? nested.retry_after_s : null;
    return { detail: message, code: nestedCode ?? topCode, retryAfterS };
  }

  return { detail: '', code: topCode, retryAfterS: null };
}
