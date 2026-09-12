import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTour } from '@reactour/tour';

import i18n from '@/i18n';
import en from '@/i18n/locales/en/common.json';
import { TutorialProvider } from './TutorialTour';

function OpenTour() {
  const { setIsOpen } = useTour();
  useEffect(() => {
    setIsOpen(true);
  }, [setIsOpen]);
  return null;
}

describe('TutorialTour i18n', () => {
  beforeEach(async () => {
    i18n.addResourceBundle('en', 'common', en, true, true);
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('renders English step titles when the language is en', async () => {
    render(
      <MemoryRouter>
        <TutorialProvider>
          <OpenTour />
        </TutorialProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Welcome to LexFlow!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
