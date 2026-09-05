/**
 * Graph page golden path: global view, local/global toggle, path finder (#25).
 *
 * Mock mode (`VITE_USE_MOCK !== 'false'`) so the suite never talks to FastAPI.
 */

import { test, expect } from './fixtures';

test('global graph view, toggle, and path finder', async ({ page }) => {
  await page.goto('/graph?view=global');

  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await expect(page.getByTestId('graph-truncation-banner')).toBeVisible();
  await expect(page.getByTestId('graph-truncation-banner')).toContainText(/de 12000|of 12000/i);

  await page.getByRole('button', { name: /^local$/i }).click();
  await expect(page).toHaveURL(/\/graph/);
  await expect(page).not.toHaveURL(/view=global/);

  await page.getByRole('button', { name: /^global$/i }).click();
  await expect(page).toHaveURL(/view=global/);

  await page.getByRole('button', { name: /camino|path/i }).click();
  await page.getByLabel(/origen|from/i).fill('CE');
  await page.getByLabel(/destino|to/i).fill('LO3-18');
  await page.getByRole('button', { name: /buscar camino|find path/i }).click();

  await expect(page.getByRole('button', { name: 'CE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LO3-18' })).toBeVisible();
});
