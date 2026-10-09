import { test, expect } from '@playwright/test';

test('full-tab HUD follows the selected companion and replay returns to live', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Willow Lead adventurer/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Choose demo companion role' }).selectOption('designer');
  await page.getByRole('button', { name: 'Send a companion' }).click();
  await expect(page.getByRole('button', { name: /Designer On a quest/ })).toBeVisible();
  await page.getByRole('button', { name: 'Expand village to full tab' }).click();
  await expect(page.locator('#resident-hud')).toBeVisible();
  await page.getByRole('combobox', { name: 'Select village resident' }).selectOption({ index: 1 });
  await expect(page.locator('#resident-hud')).toContainText('Designer');
  await page.getByRole('button', { name: '↺ Replay' }).click();
  await expect(page.locator('#replay-caption')).toContainText('1/');
  await page.locator('#replay-range').press('End');
  await expect(page.locator('#replay-caption')).not.toContainText('1/');
  await page.getByRole('button', { name: '● Live' }).click();
  await expect(page.locator('#replay-caption')).toHaveText('Live village');
  await page.getByRole('button', { name: 'Exit full-tab village' }).click();
  await expect(page.locator('.world-panel')).not.toHaveClass(/is-full-tab/);
});

test('mobile full-tab view exits with Escape and season preference survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Village season' }).selectOption('winter');
  await page.getByRole('button', { name: 'Expand village to full tab' }).click();
  const panel = page.locator('.world-panel');
  await expect(panel).toHaveClass(/is-full-tab/);
  const bounds = await panel.boundingBox();
  expect(bounds?.width).toBe(390);
  expect(bounds?.height).toBe(844);
  await page.keyboard.press('Escape');
  await expect(panel).not.toHaveClass(/is-full-tab/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Village season' })).toHaveValue('winter');
});

test('receiver status recovers after the event stream reconnects', async ({ page }) => {
  await page.route('**/api/stream', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#connection')).toContainText('Reconnecting');
  await page.unroute('**/api/stream');
  await page.reload();
  await expect(page.locator('#connection')).toContainText('Receiver connected');
});
