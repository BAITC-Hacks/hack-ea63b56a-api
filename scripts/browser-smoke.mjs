import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const output = new URL('../frontend/test-results/', import.meta.url);
await mkdir(output, { recursive: true });

try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const dense = page.getByRole('button', { name: /Корпоратив · ведущий/ });
    await dense.click();
    await page.getByRole('heading', { name: 'Подходящие подрядчики' }).waitFor();
    const results = page.locator('section[aria-labelledby="results-title"]');
    assert.equal(await results.locator('li').count(), 3);
    const idsBefore = await results.locator('h3').allTextContents();
    await page.getByRole('button', { name: 'Найти подрядчиков' }).click();
    await page.getByRole('heading', { name: 'Подходящие подрядчики' }).waitFor();
    assert.deepEqual(await results.locator('h3').allTextContents(), idsBefore);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}px`);
    await page.screenshot({ path: fileURLToPath(new URL(`acceptance-${width}.png`, output)), fullPage: true });

    await page.getByLabel('Дата мероприятия').fill('2026-12-20');
    await page.getByRole('button', { name: 'Найти подрядчиков' }).click();
    await page.getByRole('heading', { name: 'Кандидаты есть, но условия не подошли' }).waitFor();
    assert.ok((await results.textContent()).includes('заняты'));
    assert.equal(await results.locator('li').count(), 0);

    await page.getByRole('button', { name: /Корпоратив · флорист/ }).click();
    await page.getByRole('heading', { name: 'Подходящие подрядчики' }).waitFor();
    assert.equal(await results.locator('li').count(), 1);
    assert.equal(await results.getByText('Синтетический профиль', { exact: true }).count(), 1);
    await page.getByLabel(/Категория подрядчика/).click();
    await page.getByRole('option', { name: 'Инструменталист' }).click();
    await page.getByRole('button', { name: 'Найти подрядчиков' }).click();
    await page.getByRole('heading', { name: 'В городе нет этой категории' }).waitFor();

    await page.getByRole('button', { name: /Бюджет без совпадений/ }).click();
    await page.getByRole('heading', { name: 'Кандидаты есть, но условия не подошли' }).waitFor();
    await page.getByLabel('Бюджет,').fill('0');
    await page.getByRole('button', { name: 'Найти подрядчиков' }).click();
    await page.getByText('Бюджет должен быть больше нуля', { exact: true }).waitFor();
    assert.deepEqual(errors, [], `browser errors at ${width}px`);
    console.log(`PASS ${width}px: dense/repeat/date/rare/absent/filtered/validation; no overflow or page errors.`);
    await page.close();
  }
} finally {
  await browser.close();
}
