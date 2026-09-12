/**
 * Zustand store for the local-first document editor.
 *
 * Persists documents to localStorage via the `persist` middleware. Each
 * document is stored as a TipTap JSON object so it can be loaded back into
 * an editor without any serialisation round-trip.
 *
 * Invariants:
 * - `documents` is a Record keyed by document id (`docId`). This keeps
 *   look-ups O(1) and serialisation straightforward.
 * - `updatedAt` is set on every `saveDocument` call, enabling future
 *   "recently edited" lists without extra work.
 * - The store does NOT own the editor instance — that stays inside the
 *   component. The store is purely the persistence layer.
 *
 * --- WHERE TO CHANGE IF PERSISTENCE CHANGES ---
 * - Switch from localStorage to IndexedDB → replace `persist` with a
 *   custom storage adapter (see Zustand docs §custom-storage).
 * - Add server sync → add a `syncDocument(docId)` action that posts to
 *   `/api/v1/editor/documents/:docId`.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { JSONContent } from '@tiptap/react';

/** A single persisted document entry. */
export interface EditorDocument {
  /** Unique identifier — doubles as the URL segment (`:docId`). */
  id: string;
  /** Human-readable title, editable inline on the editor page. */
  title: string;
  /** TipTap JSON representation of the document body. */
  content: JSONContent;
  /** ISO timestamp of the last save. */
  updatedAt: string;
}

interface EditorState {
  /** All persisted documents, indexed by id. */
  documents: Record<string, EditorDocument>;

  /** Set when localStorage quota is exceeded; in-memory state remains authoritative. */
  persistError: string | null;

  /**
   * Upsert a document. Creates it if it does not exist yet; updates
   * `content`, `title`, and `updatedAt` if it does.
   */
  saveDocument(doc: Omit<EditorDocument, 'updatedAt'>): void;

  /** Return a document by id, or `undefined` if it has not been saved yet. */
  getDocument(id: string): EditorDocument | undefined;

  /** Documents sorted by `updatedAt` descending (most recent first). */
  listDocuments(): EditorDocument[];

  /**
   * Mint a new document, persist it immediately, and return its id.
   * `title` defaults to `'Untitled'` — the UI localises the empty display.
   */
  createDocument(title?: string): string;

  /** Clear the persist-error flag after the user acknowledges it. */
  clearPersistError(): void;
}

/**
 * Initial TipTap JSON content for a brand-new draft document.
 *
 * A minimal paragraph node keeps the editor ready for input without
 * showing a blank white box.
 */
const EMPTY_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** Legacy default id — existing localStorage drafts keep this key. */
export const DEFAULT_DOC_ID = 'draft';

/** Default title for a newly minted document (UI may localise the empty display). */
export const DEFAULT_NEW_DOC_TITLE = 'Untitled';

/** Construct a fresh document stub for `id` with empty content. */
export function makeDefaultDocument(id: string, title?: string): EditorDocument {
  return {
    id,
    title: title ?? (id === DEFAULT_DOC_ID ? 'Draft' : DEFAULT_NEW_DOC_TITLE),
    content: EMPTY_CONTENT,
    updatedAt: new Date().toISOString(),
  };
}

/** Sort store values by recency. Pure — safe to call from React with `useMemo`. */
export function listDocuments(documents: Record<string, EditorDocument>): EditorDocument[] {
  return Object.values(documents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** localStorage wrapper that surfaces QuotaExceededError to the store (#44 R5). */
function createEditorStorage(): StateStorage {
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          // Guard avoids a setState → persist → setItem loop when quota stays exceeded.
          if (useEditorStore.getState().persistError !== 'quota_exceeded') {
            useEditorStore.setState({ persistError: 'quota_exceeded' });
          }
          return;
        }
        throw err;
      }
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      documents: {},
      persistError: null,

      saveDocument: (doc) =>
        set((state) => ({
          persistError: null,
          documents: {
            ...state.documents,
            [doc.id]: {
              ...doc,
              updatedAt: new Date().toISOString(),
            },
          },
        })),

      getDocument: (id) => get().documents[id],

      listDocuments: () => listDocuments(get().documents),

      createDocument: (title) => {
        const id = crypto.randomUUID();
        const stub = makeDefaultDocument(id, title ?? DEFAULT_NEW_DOC_TITLE);
        get().saveDocument({ id: stub.id, title: stub.title, content: stub.content });
        return id;
      },

      clearPersistError: () => set({ persistError: null }),
    }),
    {
      name: 'lexflow.editor',
      storage: createJSONStorage(() => createEditorStorage()),
      // Persist all documents — the store is the source of truth.
      partialize: (s) => ({ documents: s.documents }),
    },
  ),
);
