import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '../locales/en/common.json';
import es from '../locales/es/common.json';

type JsonTree = { [key: string]: string | JsonTree };

function flattenKeys(tree: JsonTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      keys.push(path);
    } else {
      keys.push(...flattenKeys(value, path));
    }
  }
  return keys.sort();
}

const SRC_ROOT = join(process.cwd(), 'src');

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

function loadAppSource(): string {
  return collectSourceFiles(SRC_ROOT)
    .map((file) => readFileSync(file, 'utf-8'))
    .join('\n');
}

/** Keys interpolated via template literals rather than string literals. */
const DYNAMIC_PREFIXES = [
  'modelTier.',
  'greeting.bucket.',
  'greeting.pool.',
  'greeting.poolMeta.',
] as const;

function isKeyReferenced(key: string, source: string): boolean {
  if (source.includes(`'${key}'`) || source.includes(`"${key}"`)) return true;
  const pluralBase = key.match(/^(.+)_(one|other|few|many)$/)?.[1];
  if (pluralBase && (source.includes(`'${pluralBase}'`) || source.includes(`"${pluralBase}"`))) {
    return true;
  }
  return DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix) && source.includes(prefix));
}

/** Orphans removed in #67 — must not creep back into locale files. */
const REMOVED_ORPHAN_KEYS = [
  'settings.underConstruction',
  'lawHeader.save',
  'lawHeader.share',
  'lawHeader.export',
] as const;

/** Namespaces added or completed in the sprint-1 i18n sweep (#67). */
const SPRINT_KEY_PREFIXES = [
  'editor.toolbar.',
  'editor.contentPlaceholder',
  'editor.citationPicker.',
  'editor.templates.',
  'editor.templateFill.',
  'editor.comments.',
  'editor.aiDraft.',
  'modelTier.',
  'greeting.',
  'toast.',
  'chip.',
  'shell.skipToContent',
  'shell.openCommandPalette',
  'lawHeader.versionTimeline.',
  'lawHeader.removeUserTag',
  'chat.closeThreads',
  'chat.openThreads',
  'chat.toolCall.',
  'graph.fit',
  'explorer.groups.comunidad',
  'explorer.groups.department',
  'communities.mapView',
  'communities.listView',
  'communities.national',
] as const;

describe('i18n key usage', () => {
  const enKeys = flattenKeys(en as JsonTree);
  const esKeys = flattenKeys(es as JsonTree);
  const source = loadAppSource();

  it('does not reintroduce removed orphan keys', () => {
    for (const key of REMOVED_ORPHAN_KEYS) {
      expect(enKeys).not.toContain(key);
      expect(esKeys).not.toContain(key);
    }
  });

  it('references sprint-added locale keys in app source', () => {
    const sprintKeys = enKeys.filter((key) =>
      SPRINT_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix)),
    );
    const orphans = sprintKeys.filter((key) => !isKeyReferenced(key, source));
    expect(orphans).toEqual([]);
  });
});
