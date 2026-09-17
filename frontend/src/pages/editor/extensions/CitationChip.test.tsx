import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeViewProps } from '@tiptap/react';
import { CitationChip } from './CitationChip';

const navigateMock = vi.fn();
const useLawMock = vi.fn();
const useArticleMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/lib/queries', () => ({
  useLaw: (id: string | undefined) => useLawMock(id),
  useArticle: (lawId: string | undefined, num: string | undefined) => useArticleMock(lawId, num),
}));

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    NodeViewWrapper: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <span className={className}>{children}</span>
    ),
  };
});

function renderChip(attrs: Record<string, unknown>) {
  const props = { node: { attrs } } as NodeViewProps;
  return render(
    <MemoryRouter>
      <CitationChip {...props} />
    </MemoryRouter>,
  );
}

describe('CitationChip', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useLawMock.mockReturnValue({
      data: { title: 'Constitución Española', short: 'Constitución' },
      isLoading: false,
      isError: false,
    });
    useArticleMock.mockReturnValue({
      data: { body: [{ marker: null, text: 'España se constituye en un Estado social y democrático de Derecho.' }] },
      isLoading: false,
      isError: false,
    });
  });

  it('does not navigate on plain click — toggles preview popover instead', async () => {
    renderChip({ lawId: 'CE-1978', articleNum: '14', label: 'CE art. 14' });
    await userEvent.click(screen.getByRole('button'));
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('navigates with article anchor when Abrir ley is clicked', async () => {
    renderChip({ lawId: 'CE-1978', articleNum: '14', label: 'CE art. 14' });
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button', { name: /abrir ley/i }));
    expect(navigateMock).toHaveBeenCalledWith('/laws/CE-1978#art-14');
  });

  it('opens law in new tab on modifier click', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderChip({ lawId: 'CE-1978', articleNum: '14', label: 'CE art. 14' });
    fireEvent.click(screen.getByRole('button'), { ctrlKey: true });
    expect(openSpy).toHaveBeenCalledWith('/laws/CE-1978#art-14', '_blank', 'noopener,noreferrer');
    expect(navigateMock).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('closes popover on Escape and returns focus to chip', async () => {
    renderChip({ lawId: 'CE-1978', articleNum: null, label: 'CE' });
    const chip = screen.getByRole('button');
    await userEvent.click(chip);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(chip);
  });
});
