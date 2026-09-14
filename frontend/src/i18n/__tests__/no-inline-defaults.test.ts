import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(process.cwd(), 'src');

/** Matches `t('key', 'fallback')` / `t("key", "fallback")` with a string literal second arg. */
const INLINE_DEFAULT_RE = /\bt\(\s*['"][^'"]+['"]\s*,\s*['"]/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(SRC_ROOT, full);
    if (rel.includes('/locales/') || rel.includes('node_modules')) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe('i18n no inline t() defaults', () => {
  it('has no t(key, "literal fallback") call sites in app source', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, 'utf-8');
      if (INLINE_DEFAULT_RE.test(text)) {
        offenders.push(relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
