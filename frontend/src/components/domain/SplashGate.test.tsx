import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SplashGate } from './SplashGate';

const useWarmupMock = vi.fn();

vi.mock('../../lib/queries', () => ({
  useWarmup: () => useWarmupMock(),
}));

describe('SplashGate', () => {
  it('renders children when core warm-up is ready', () => {
    useWarmupMock.mockReturnValue({
      data: {
        ready: true,
        metadataReady: true,
        searchReady: true,
        graphReady: false,
        skippedLaws: 0,
        error: null,
        durationsSeconds: {},
      },
      isError: false,
    });

    render(
      <SplashGate>
        <div data-testid="app-content">App</div>
      </SplashGate>,
    );

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
  });

  it('maps blocking error codes to translated copy', () => {
    useWarmupMock.mockReturnValue({
      data: {
        ready: false,
        metadataReady: false,
        searchReady: false,
        graphReady: false,
        skippedLaws: 0,
        error: 'warmup_data_path_missing',
        durationsSeconds: {},
      },
      isError: false,
    });

    render(
      <SplashGate>
        <div>App</div>
      </SplashGate>,
    );

    expect(screen.getByText('No se encontró el corpus de leyes configurado.')).toBeInTheDocument();
  });

  it('shows retry messaging when backend is down', () => {
    useWarmupMock.mockReturnValue({ data: undefined, isError: true });

    render(
      <SplashGate>
        <div>App</div>
      </SplashGate>,
    );

    expect(screen.getByText('No se pudo conectar con el servidor. Seguimos reintentando…')).toBeInTheDocument();
  });
});
