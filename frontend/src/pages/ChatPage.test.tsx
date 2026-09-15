import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPage } from './ChatPage';
import { ConfirmProvider } from '@/components/ui';
import { useUi } from '@/lib/store';
import { useChatStream } from '@/stores/chat-stream';
import { api } from '@/lib/api';

const { createThreadMutate } = vi.hoisted(() => ({
  createThreadMutate: vi.fn(),
}));

const useModelsMock = vi.fn();
const useChatThreadsMock = vi.fn();
const useChatThreadMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  qk: {
    chatThread: (id: string) => ['chat', id],
    chatThreads: () => ['chat-threads'],
  },
  useChatThreads: () => useChatThreadsMock(),
  useChatThread: (id: string) => useChatThreadMock(id),
  useCreateChatThread: () => ({ mutateAsync: createThreadMutate, isPending: false }),
  useDeleteChatThread: () => ({ mutateAsync: vi.fn() }),
  useRenameChatThread: () => ({ mutateAsync: vi.fn() }),
  useModels: () => useModelsMock(),
}));

function renderChatAt(path = '/chat') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:threadId" element={<ChatPage />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/chat']}>
        <ConfirmProvider>
          <ChatPage />
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChatPage no-model banner', () => {
  beforeEach(() => {
    useUi.setState({ defaultModel: '', wizardRequested: false });
    useChatThreadsMock.mockReturnValue({ data: [] });
    useChatThreadMock.mockReturnValue({ data: [] });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:llama3.2:3b', available: false, label: 'llama3.2:3b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('shows setup banner when no model is available', () => {
    renderChat();
    expect(screen.getByText(/configura tu asistente \(2 min\)/i)).toBeInTheDocument();
  });

  it('opens the wizard overlay when CTA is clicked', async () => {
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: /configurar asistente/i }));
    expect(useUi.getState().wizardRequested).toBe(true);
  });

  it('shows the AI disclaimer under the composer', () => {
    renderChat();
    expect(screen.getByText(/generado por IA/i)).toBeInTheDocument();
  });
});

describe('ChatPage first-turn notice', () => {
  const thread = { id: 't1', title: 'Test', updatedAt: new Date().toISOString() };

  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatThreadsMock.mockReturnValue({ data: [thread], isPending: false });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('shows per-thread notice when there is no committed assistant turn', () => {
    useChatThreadMock.mockReturnValue({
      data: [{ id: 'm1', role: 'user', createdAt: new Date().toISOString(), content: 'hola' }],
    });
    renderChatAt('/chat/t1');
    expect(screen.getByText(/esta conversación usa IA/i)).toBeInTheDocument();
  });

  it('hides per-thread notice after the first assistant message', () => {
    useChatThreadMock.mockReturnValue({
      data: [
        { id: 'm1', role: 'user', createdAt: new Date().toISOString(), content: 'hola' },
        {
          id: 'm2',
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: ['respuesta'],
          sources: [],
        },
      ],
    });
    renderChatAt('/chat/t1');
    expect(screen.queryByText(/esta conversación usa IA/i)).toBeNull();
  });
});

describe('ChatPage empty state and accessibility', () => {
  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatThreadsMock.mockReturnValue({ data: [{ id: 't1', title: 'Test', updatedAt: new Date().toISOString() }] });
    useChatThreadMock.mockReturnValue({ data: [] });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('shows honest empty-state hint without @ or #tag', () => {
    renderChat();
    expect(screen.getByText(/consultará el corpus automáticamente/i)).toBeInTheDocument();
    expect(screen.queryByText('@')).not.toBeInTheDocument();
    expect(screen.queryByText('#tag')).not.toBeInTheDocument();
  });

  it('exposes aria-live polite on the transcript region', () => {
    renderChat();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'false');
  });
});

describe('ChatPage sources cited header', () => {
  const thread = { id: 't1', title: 'Test', updatedAt: new Date().toISOString() };
  const source = {
    law: 'LO 3/2018',
    article: '14',
    date: '2018-12-05',
    snippet: 'texto',
    target: { lawId: 'BOE-A-2018-16673', articleNum: '14' },
  };

  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatStream.setState({ threads: {} });
    useChatThreadsMock.mockReturnValue({ data: [thread] });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('shows the sources cited count when persisted sources match rendered history', () => {
    useChatThreadMock.mockReturnValue({
      data: [
        { id: 'm1', role: 'user', createdAt: new Date().toISOString(), content: 'hola' },
        {
          id: 'm2',
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: ['respuesta'],
          sources: [source],
        },
      ],
    });
    renderChatAt('/chat/t1');
    expect(screen.getByText(/1 fuente citada|1 cited source/i)).toBeInTheDocument();
  });

  it('hides the sources cited count while streaming sources before persistence', () => {
    useChatThreadMock.mockReturnValue({ data: [] });
    useChatStream.setState({
      threads: {
        t1: {
          stream: {
            id: 'stream-1',
            role: 'assistant',
            createdAt: new Date().toISOString(),
            content: ['parcial'],
            sources: [source],
            streaming: true,
          },
          pendingUser: null,
          sending: true,
          abortController: null,
        },
      },
    });
    renderChatAt('/chat/t1');
    expect(screen.queryByText(/0 fuentes citadas|0 cited sources/i)).toBeNull();
    expect(screen.queryByText(/1 fuentes citadas|1 cited sources/i)).toBeNull();
  });

  it('shows turns only when there are no cited sources', () => {
    useChatThreadMock.mockReturnValue({
      data: [
        { id: 'm1', role: 'user', createdAt: new Date().toISOString(), content: 'hola' },
        {
          id: 'm2',
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: ['respuesta'],
          sources: [],
        },
      ],
    });
    renderChatAt('/chat/t1');
    expect(screen.getByText(/2 turnos|2 turns/i)).toBeInTheDocument();
    expect(screen.queryByText(/fuentes citadas|cited sources/i)).toBeNull();
  });
});

describe('ChatPage thread-scoped streaming', () => {
  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatStream.setState({ threads: {} });
    useChatThreadsMock.mockReturnValue({
      data: [
        { id: 'thread-a', title: 'A', updatedAt: new Date().toISOString() },
        { id: 'thread-b', title: 'B', updatedAt: new Date().toISOString() },
      ],
    });
    useChatThreadMock.mockImplementation((threadId: string) => ({
      data:
        threadId === 'thread-a'
          ? [{ id: 'm1', role: 'user', createdAt: new Date().toISOString(), content: 'hola A' }]
          : [],
    }));
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('does not bleed partial stream from thread A into thread B', async () => {
    const sendSpy = vi.spyOn(api.chat, 'send').mockImplementation(async function* (_threadId) {
      yield { type: 'text', delta: 'partial from A' };
      await new Promise((resolve) => setTimeout(resolve, 200));
      yield { type: 'done' };
    });

    renderChatAt('/chat/thread-a');

    const textarea = screen.getByPlaceholderText(/pregunta algo al corpus/i);
    await userEvent.type(textarea, 'hola');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await screen.findByText('partial from A');

    await userEvent.click(screen.getByRole('button', { name: /^B$/i }));
    expect(screen.queryByText('partial from A')).toBeNull();

    sendSpy.mockRestore();
  });
});

describe('ChatPage new-thread hotkey', () => {
  beforeEach(() => {
    createThreadMutate.mockReset();
    createThreadMutate.mockResolvedValue({ id: 'new-thread' });
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatThreadsMock.mockReturnValue({ data: [{ id: 't1', title: 'Test', updatedAt: new Date().toISOString() }] });
    useChatThreadMock.mockReturnValue({ data: [] });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('creates a thread on mod+n', async () => {
    renderChat();
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    await waitFor(() => {
      expect(createThreadMutate).toHaveBeenCalledWith({ model: 'ollama:qwen2.5:7b' });
    });
  });
});

describe('ChatPage default thread selection', () => {
  beforeEach(() => {
    useUi.setState({ defaultModel: 'ollama:qwen2.5:7b', wizardRequested: false });
    useChatThreadMock.mockReturnValue({ data: [] });
    useModelsMock.mockReturnValue({
      data: [
        { id: 'ollama:qwen2.5:7b', available: true, label: 'qwen2.5:7b', vendor: 'ollama', kind: 'local' },
      ],
    });
  });

  it('navigates /chat to the newest thread and highlights its row', async () => {
    useChatThreadsMock.mockReturnValue({
      data: [
        { id: 'b', title: 'Older', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a', title: 'Newer', updatedAt: '2026-06-01T00:00:00.000Z' },
      ],
    });
    renderChatAt('/chat');
    const newer = await screen.findByRole('button', { name: 'Newer' });
    expect(newer.className).toContain('font-semibold');
    expect(screen.getByRole('button', { name: 'Older' }).className).not.toContain('font-semibold');
  });

  it('stays on a true empty state when there are no threads', () => {
    useChatThreadsMock.mockReturnValue({ data: [] });
    renderChatAt('/chat');
    expect(useChatThreadMock).not.toHaveBeenCalledWith('eipd');
    expect(screen.getByText(/consultará el corpus automáticamente/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Older$|^Newer$|^Test$/ })).toBeNull();
  });

  it('keeps an unknown deep-link id without crashing', () => {
    useChatThreadsMock.mockReturnValue({
      data: [{ id: 'a', title: 'Real thread', updatedAt: '2026-06-01T00:00:00.000Z' }],
    });
    renderChatAt('/chat/unknown-id');
    expect(screen.getByText('Conversación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Real thread' }).className).not.toContain('font-semibold');
  });
});

