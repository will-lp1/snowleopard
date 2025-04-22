import { generateId } from 'ai';
import { getUnixTime } from 'date-fns';
import { test, expect, Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const testEmail = `test-${getUnixTime(new Date())}@playwright.com`;
const testPassword = generateId(16);

class AuthPage {
  constructor(private page: Page) {}

  async gotoLogin() {
    await this.page.goto('/login');
    await expect(this.page.getByRole('heading')).toContainText('Sign In');
  }

  async gotoRegister() {
    await this.page.goto('/register');
    await expect(this.page.getByRole('heading')).toContainText('Sign Up');
  }

  async register(email: string, password: string) {
    await this.gotoRegister();
    await this.page.getByLabel('Email').click();
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').click();
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign Up' }).click();
  }

  async login(email: string, password: string) {
    await this.gotoLogin();
    await this.page.getByLabel('Email').click();
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').click();
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }

  async expectToastToContain(text: string, timeout = 5000) {
    await expect(this.page.locator('[data-sonner-toast]')).toContainText(text, { timeout });
  }
}

test.describe
  .serial('authentication', () => {
    let authPage: AuthPage;

    test.beforeEach(async ({ page }) => {
      authPage = new AuthPage(page);
    });

    test('redirect to login page when unauthenticated', async ({ page }) => {
      await page.goto('/documents');
      await expect(page).toHaveURL(/.*\/login/);
      await expect(page.getByRole('heading')).toContainText('Sign In');
    });

    test('register a test account', async ({ page }) => {
      await authPage.register(testEmail, testPassword);
      await page.waitForURL('/documents', { timeout: 10000 });
      await expect(page).toHaveURL('/documents');
      await expect(page.locator('textarea[placeholder*="Send a message"]')).toBeVisible();
    });

    test('register test account with existing email', async () => {
      await authPage.register(testEmail, testPassword);
      await authPage.expectToastToContain('Account already exists');
    });

    test('log into account', async ({ page }) => {
      await authPage.login(testEmail, testPassword);

      await page.waitForURL('/documents', { timeout: 10000 });
      await expect(page).toHaveURL('/documents');
      await expect(page.locator('textarea[placeholder*="Send a message"]')).toBeVisible();
    });
  });
