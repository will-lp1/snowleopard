import path from 'path';
import { generateId } from 'ai';
import { getUnixTime } from 'date-fns';
import { expect, test as setup } from '@playwright/test';

const authFile = path.join(__dirname, '../playwright/.auth/session.json');

setup('authenticate', async ({ page }) => {
  const testEmail = `test-${getUnixTime(new Date())}@playwright.com`;
  const testPassword = generateId(16);

  await page.goto('/register');
  await page.getByLabel('Email').click();
  await page.getByLabel('Email').fill(testEmail);
  await page.getByLabel('Password').click();
  await page.getByLabel('Password').fill(testPassword);
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.locator('[data-sonner-toast]')).toContainText(
    'Account created! Redirecting...',
    { timeout: 10000 }
  );

  await page.waitForURL('/documents', { timeout: 10000 });

  await page.context().storageState({ path: authFile });
});
