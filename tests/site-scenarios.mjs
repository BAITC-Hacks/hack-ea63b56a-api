import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin);
  const results = page.locator('section[aria-labelledby="results-title"]');
  const titles = results.locator('li [data-slot="card-title"]');
  const submit = page.getByRole('button', { name: 'Найти подрядчиков' });
  const endpoint = '**/api/v1/recommendations';

  async function requestAfter(action) {
    const response = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/recommendations'
      && response.request().method() === 'POST');
    await action();
    return response;
  }

  const firstResponse = await requestAfter(() => page.getByRole('button', { name: /Корпоратив · ведущий/ }).click());
  assert.equal(firstResponse.status(), 200);
  const first = await firstResponse.json();
  assert.equal(first.count, 3);
  const names = first.items.map((item) => item.name);
  assert.equal(names.length, 3);
  assert.ok(names.every((name) => name.trim().length > 0));
  await expect(titles).toHaveText(names);
  const repeatedResponse = await requestAfter(() => submit.click());
  assert.equal(repeatedResponse.status(), 200);
  assert.deepEqual(await repeatedResponse.json(), first);
  await expect(titles).toHaveText(names);
  console.log('PASS: repeated request preserves all three non-empty card names and the complete API response.');

  await page.route(endpoint, (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Сервис временно недоступен' }),
  }));
  const failed = await requestAfter(() => submit.click());
  assert.equal(failed.status(), 503);
  await expect(page.getByText('Сервис временно недоступен', { exact: true }).first()).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.unroute(endpoint);
  const recovered = await requestAfter(() => submit.click());
  assert.equal(recovered.status(), 200);
  await expect(titles).toHaveText(names);
  console.log('PASS: API 503 is visible and the next request recovers without reloading the page.');

  const markup = '<img src="x" onerror="document.documentElement.dataset.aiExecuted=\'yes\'">';
  const explanation = `Для формата корпоратив текст модели: ${markup}`;
  const fixture = { ...first, analysisMode: 'ai', count: 1, exactCount: 1, alternativeCount: 0,
    items: [{ ...first.items[0], explanation }] };
  await page.route(endpoint, (route) => route.fulfill({ json: fixture }));
  const injected = await requestAfter(() => submit.click());
  assert.equal(injected.status(), 200);
  await expect(results.getByText(explanation, { exact: true })).toBeVisible();
  await expect(titles).toHaveText([first.items[0].name]);
  assert.equal(await results.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.aiExecuted), undefined);
  assert.deepEqual(pageErrors, []);
  console.log('PASS: HTML in AI explanation is displayed as text, without creating an image or executing code.');
} finally {
  await browser.close();
}
