import { expect, test, type Page } from '@playwright/test';

async function completeFreshOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Track money without slowing down.' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Choose the currencies you use.' })).toBeVisible();
  await page.getByLabel('Cash', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Make daily logging faster.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Ravel' }).click();
}

test('delete confirmation stays above the transaction editor and owns Escape', async ({ page }) => {
  await page.goto('/app');
  await completeFreshOnboarding(page);

  await page.goto('/app/add?mode=quick&type=expense&amount=10&title=Layering%20test&method=cash');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByText('Transaction saved.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'View transactions', exact: true }).click();
  await page.getByRole('button', { name: /Layering test/ }).click();

  const editDialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole('button', { name: 'Delete transaction', exact: true }).click();

  const deleteDialog = page.getByRole('dialog', { name: 'Delete transaction' });
  await expect(deleteDialog).toBeVisible();
  await expect(editDialog).toBeVisible();

  const editLayer = await editDialog.evaluate((node) =>
    Number.parseInt(getComputedStyle(node.parentElement as HTMLElement).zIndex, 10)
  );
  const deleteLayer = await deleteDialog.evaluate((node) =>
    Number.parseInt(getComputedStyle(node.parentElement as HTMLElement).zIndex, 10)
  );
  expect(deleteLayer).toBeGreaterThan(editLayer);

  await page.keyboard.press('Escape');
  await expect(deleteDialog).toBeHidden();
  await expect(editDialog).toBeVisible();
});
