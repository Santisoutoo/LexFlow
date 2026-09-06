import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPage } from './ChatPage';
import { ConfirmProvider } from '@/components/ui';
import { useUi } from '@/lib/store';

const useModelsMock = vi.fn();
const useChatThreadsMock = vi.fn();
const useChatThreadMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  qk: {
    chatThread: (id: string) => ['chat', id],
    chatThreads: () => ['chat-threads'],
  },
  useChatThreads: () => useChatThreadsMock(),
  useChatThread: () => useChatThreadMock(),
  useCreateChatThread: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteChatThread: () => ({ mutateAsync: vi.fn() }),
  useRenameChatThread: () => ({ mutateAsync: vi.fn() }),
  useModels: () => useModelsMock(),
}));

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
});
