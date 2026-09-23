import assert from 'node:assert/strict';

const base = (process.env.API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const dense = {
  city: 'Алматы', date: '2026-10-15', eventFormat: 'корпоратив',
  category: 'Ведущий', budgetKzt: 900000, language: 'русский',
};

async function recommend(query, expectedStatus) {
  const started = performance.now();
  const response = await fetch(`${base}/recommendations`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query),
    signal: AbortSignal.timeout(11000),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, expectedStatus);
  assert.equal(data.count, data.items.length);
  assert.ok(data.count <= 3);
  assert.ok(data.message.length > 15);
  for (const card of data.items) {
    assert.ok(card.priceFromKzt <= query.budgetKzt);
    assert.ok(card.explanation.length > 40);
    assert.equal(typeof card.synthetic, 'boolean');
    assert.equal(typeof card.city_imputed, 'boolean');
    assert.equal(typeof card.price_imputed, 'boolean');
  }
  console.log(JSON.stringify({ query, status: data.status, count: data.count, mode: data.analysisMode,
    milliseconds: Math.round(performance.now() - started), ids: data.items.map(item => item.id), message: data.message }));
  return data;
}

const health = await fetch(`${base}/health`).then(r => r.json());
assert.equal(health.status, 'ok');
assert.equal(health.contractors, 66);
const catalog = await fetch(`${base}/catalog`).then(r => r.json());
assert.ok(catalog.categories.includes('Ведущий'));
assert.deepEqual(catalog.calendar, { from: '2026-09-23', to: '2026-12-31' });
const autumn = await recommend(dense, 'matched');
assert.equal(autumn.count, 3);
assert.equal(autumn.totalCandidates, 10);
assert.equal(autumn.exclusions.busy, 2);
assert.deepEqual(await recommend(dense, 'matched'), autumn);
const rare = await recommend({ ...dense, city: 'Астана', category: 'Флорист', date: '2026-11-14' }, 'matched');
assert.equal(rare.count, 1);
assert.equal(rare.items[0].id, 'HK-90002');
assert.equal(rare.items[0].synthetic, true);
await recommend({ ...dense, budgetKzt: 1 }, 'no_candidates_after_filters');
await recommend({ ...dense, city: 'Астана', category: 'Инструменталист' }, 'no_category_in_city');
const winter = await recommend({ ...dense, date: '2026-12-20' }, 'no_candidates_after_filters');
assert.equal(winter.exclusions.busy, 8);
assert.notDeepEqual(winter.items.map(x => x.id), autumn.items.map(x => x.id));
const badDate = await fetch(`${base}/recommendations`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...dense, date: '2026-02-30' }) });
assert.equal(badDate.status, 400);
const page = await fetch(frontend);
assert.equal(page.status, 200);
assert.ok((await page.text()).includes('HackAlem'));
const proxy = await fetch(`${frontend}/api/v1/health`);
assert.equal(proxy.status, 200);
assert.equal((await proxy.json()).contractors, 66);
console.log('PASS: API, deterministic repeat, all outcomes, calendar, flags, validation, frontend and proxy.');
