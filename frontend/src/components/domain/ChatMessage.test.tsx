import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessage } from './ChatMessage';
import type { AssistantMessage, ChatSource } from '@/lib/types';

vi.mock('@/lib/queries', () => ({
  useModels: () => ({ data: [] }),
}));

const baseAssistant: AssistantMessage = {
  id: 'a1',
  role: 'assistant',
  createdAt: new Date().toISOString(),
  content: ['test answer'],
  sources: [],
  streaming: false,
};

const sampleSource: ChatSource = {
  law: 'LOPDGDD',
  article: 'Art. 28',
  date: '2018',
  snippet: 'snippet',
  target: { lawId: 'BOE-A-2018-16673', articleNum: '28' },
};

describe('ChatMessage ungrounded warning', () => {
  it('shows warning on completed assistant message with zero sources', () => {
    render(<ChatMessage message={baseAssistant} />);
    expect(screen.getByText(/sin fuentes del corpus/i)).toBeInTheDocument();
  });

  it('hides warning when sources are present', () => {
    render(
      <ChatMessage
        message={{ ...baseAssistant, sources: [sampleSource] }}
      />,
    );
    expect(screen.queryByText(/sin fuentes del corpus/i)).toBeNull();
  });

  it('hides warning while streaming', () => {
    render(
      <ChatMessage
        message={{ ...baseAssistant, streaming: true }}
      />,
    );
    expect(screen.queryByText(/sin fuentes del corpus/i)).toBeNull();
  });

  it('hides warning when the message has an error', () => {
    render(
      <ChatMessage
        message={{ ...baseAssistant, error: { detail: 'fail' } }}
      />,
    );
    expect(screen.queryByText(/sin fuentes del corpus/i)).toBeNull();
  });
});
