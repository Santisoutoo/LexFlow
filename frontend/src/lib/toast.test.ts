import { beforeEach, describe, expect, it } from 'vitest';

import { toast, useToast } from './toast';

describe('toast deduplication', () => {
  beforeEach(() => {
    useToast.setState({ toasts: [] });
  });

  it('shows only one entry for identical consecutive toasts', () => {
    const payload = { tone: 'danger' as const, title: 'No se pudo conectar', message: 'Network down' };
    toast(payload);
    toast(payload);
    expect(useToast.getState().toasts).toHaveLength(1);
  });

  it('allows distinct messages through', () => {
    toast({ tone: 'danger', title: 'A', message: 'one' });
    toast({ tone: 'danger', title: 'B', message: 'two' });
    expect(useToast.getState().toasts).toHaveLength(2);
  });
});
