import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AiService } from '../src/ai/ai.service';
import { Contractor } from '../src/common/domain';
import { ContractorsService } from '../src/contractors/contractors.service';
import { MatchingService } from '../src/matching/matching.service';
import { ExplainerService } from '../src/recommendations/explainer.service';
import { RecommendationsService } from '../src/recommendations/recommendations.service';
import { RecommendationRequestDto } from '../src/recommendations/recommendation.dto';
import { SnapshotService } from '../src/recommendations/snapshot.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';

const dense = {
  city: 'Алматы', date: '2026-10-15', eventFormat: 'корпоратив',
  category: 'Ведущий', budgetKzt: 900000, language: 'русский',
};

function service() {
  const repo = new ContractorsService();
  const matching = new MatchingService();
  const ai = new AiService();
  const explainer = new ExplainerService();
  return { repo, matching, ai, recommendations: new RecommendationsService(repo, matching, ai, explainer, new SnapshotService()) };
}

function dto(input: typeof dense): RecommendationRequestDto {
  return Object.assign(new RecommendationRequestDto(), input);
}

describe('CSV and matching fixtures', () => {
  const repo = new ContractorsService();
  const matching = new MatchingService();

  it('loads 66 records and exact city/quality counts', () => {
    expect(repo.contractors).toHaveLength(66);
    expect(repo.contractors.filter((c) => c.city === 'Алматы')).toHaveLength(50);
    expect(repo.contractors.filter((c) => c.city === 'Астана')).toHaveLength(15);
    expect(repo.contractors.filter((c) => c.city === 'Зарубежье')).toHaveLength(1);
    expect(repo.contractors.filter((c) => c.synthetic)).toHaveLength(13);
    expect(repo.contractors.filter((c) => c.city_imputed)).toHaveLength(8);
    expect(repo.contractors.filter((c) => c.price_imputed)).toHaveLength(18);
    expect(repo.contractors.filter((c) => c.maxHours === null)).toHaveLength(9);
    const compound = repo.contractors.find((c) => c.id === 'HK-90011')!;
    expect(compound.categories).toEqual(['Банкетный зал', 'Отель', 'Ресторан']);
    expect(compound.eventFormats).toEqual(['свадьба', 'той', 'корпоратив', 'юбилей']);
    expect(compound.languages).toEqual(['казахский', 'русский']);
    expect(compound.busyDates.has('2026-10-15')).toBe(false);
    expect(compound.busyDates.has('2026-12-20')).toBe(true);
    expect(readFileSync('data/contractors.csv')).toEqual(readFileSync('../hackathon dataset anonymized.csv'));
  });

  it('checks independent calendar population before other filters', () => {
    const base = { ...dense, budgetKzt: 9_000_000, language: undefined };
    const oct = matching.match(repo.contractors, base);
    const dec = matching.match(repo.contractors, { ...base, date: '2026-12-20' });
    expect(oct.population).toHaveLength(10);
    expect(oct.population.filter((c) => !c.busyDates.has('2026-10-15'))).toHaveLength(8);
    expect(dec.population.filter((c) => !c.busyDates.has('2026-12-20'))).toHaveLength(2);
    const rare = matching.match(repo.contractors, { ...base, city: 'Астана', category: 'Флорист', date: '2026-11-14' });
    expect(rare.population).toHaveLength(1);
    expect(rare.population.filter((c) => !c.busyDates.has('2026-11-14'))).toHaveLength(1);
    expect(matching.match(repo.contractors, { ...base, city: 'Астана', category: 'Инструменталист' }).population).toHaveLength(0);
  });

  it('filters compound fields, format, language, duration and null max hours', () => {
    const make = (override: Partial<Contractor>): Contractor => ({
      id: 'A', name: 'A', categories: ['Ведущий', 'Фотограф'], city: 'Алматы',
      city_imputed: false, synthetic: false, priceFromKzt: 100,
      price_imputed: false, eventFormats: ['корпоратив', 'юбилей'],
      languages: ['русский', 'казахский'], maxHours: null,
      busyDates: new Set(), description: 'Ведущий корпоративных мероприятий.', ...override,
    });
    const candidates = [make({ id: 'A' }), make({ id: 'B', eventFormats: ['свадьба'] }),
      make({ id: 'C', languages: ['английский'] }), make({ id: 'D', maxHours: 4 }),
      make({ id: 'E', busyDates: new Set(['2026-10-15']) }), make({ id: 'F', priceFromKzt: 1000 })];
    const result = matching.match(candidates, { ...dense, category: 'Фотограф', budgetKzt: 500, durationHours: 6 });
    expect(result.population).toHaveLength(6);
    expect(result.eligible.map((c) => c.id)).toEqual(['A']);
    expect(result.exclusions).toEqual({ busy: 1, budget: 1, format: 1, language: 1, duration: 1 });
  });

  it('rejects malformed CSV flags, dates, headers and duplicate IDs', () => {
    const original = process.env.DATASET_PATH;
    const directory = mkdtempSync(join(tmpdir(), 'hackalem-csv-'));
    const source = readFileSync('../hackathon dataset anonymized.csv', 'utf8');
    try {
      for (const changed of [
        source.replace('city_imputed', 'wrong_header'),
        source.replace(',False,False,200000', ',Maybe,False,200000'),
        source.replace('2026-09-25', '2026-02-30'),
        `${source.trimEnd()}\n${source.split('\n')[1]}\n`,
      ]) {
        const file = join(directory, 'bad.csv');
        writeFileSync(file, changed);
        process.env.DATASET_PATH = file;
        expect(() => new ContractorsService()).toThrow();
      }
    } finally {
      if (original === undefined) delete process.env.DATASET_PATH;
      else process.env.DATASET_PATH = original;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('recommendations, snapshots and fallback', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'hackalem-backend-'));
    process.env.CACHE_DIR = directory;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  it('has all three statuses, no busy cards, max three, grounded distinct explanations and shortage counts', async () => {
    const { recommendations, repo } = service();
    const matched = await recommendations.recommend(dto(dense));
    expect(matched.status).toBe('matched');
    expect(matched.analysisMode).toBe('fallback');
    expect(matched.items.length).toBeLessThanOrEqual(3);
    expect(matched.count).toBe(matched.items.length);
    expect(matched.totalCandidates).toBe(10);
    expect(matched.items.every((item) => !repo.contractors.find((c) => c.id === item.id)!.busyDates.has(dense.date))).toBe(true);
    for (const item of matched.items) {
      expect(item.explanation).toContain('15 октября 2026');
      expect(item.explanation).toContain('900');
      expect(item.explanation).toContain('корпоратив');
      expect(item).toMatchObject({ matchType: 'exact', alternative: false, availableDate: dense.date, differences: [] });
      expect(item.criteria.map((criterion) => criterion.key)).toEqual([
        'category', 'eventFormat', 'city', 'date', 'budget', 'language',
      ]);
      expect(item.criteria.every((criterion) => criterion.status === 'matched')).toBe(true);
      expect(item.criteria.find((criterion) => criterion.key === 'budget')).toMatchObject({
        requested: 'до 900 000 ₸', offered: expect.stringMatching(/^от .+ ₸$/u),
      });
      const quote = item.explanation.match(/(?:описание профиля|формату): «(.+)»/u)?.[1];
      expect(repo.contractors.find((c) => c.id === item.id)!.description.replace(/\s+/g, ' ')).toContain(quote);
    }
    expect(new Set(matched.items.map((item) => item.explanation)).size).toBe(matched.count);

    const rare = await recommendations.recommend(dto({ ...dense, city: 'Астана', date: '2026-11-14', category: 'Флорист' }));
    expect(rare.totalCandidates).toBe(1);
    expect(rare.count).toBe(1);
    expect(rare.items[0].synthetic).toBe(true);
    expect(rare.message).toMatch(/из 3/);
    const absent = await recommendations.recommend(dto({ ...dense, city: 'Астана', category: 'Инструменталист' }));
    expect(absent.status).toBe('no_category_in_city');
    expect(absent.analysisMode).toBe('not_needed');
    expect(absent.message).toContain('не стали подменять');
    const filtered = await recommendations.recommend(dto({ ...dense, budgetKzt: 1 }));
    expect(filtered.status).toBe('no_candidates_after_filters');
    expect(filtered.exclusions.budget).toBe(10);
    expect(filtered.items).toEqual([]);
    expect(filtered.message).toContain('не стали предлагать другой тип события');
  });

  it('keeps exact matches first and fills remaining cards with transparent alternatives', async () => {
    const { recommendations, repo } = service();
    const base = { ...repo.contractors[0], city: 'Алматы', categories: ['Ведущий'],
      eventFormats: ['свадьба'], languages: ['русский'], maxHours: 8,
      description: 'Проводит камерные свадебные церемонии и интерактивы для гостей.' };
    repo.contractors.splice(0, repo.contractors.length,
      { ...base, id: 'exact', name: 'Точный', priceFromKzt: 90_000, busyDates: new Set<string>() },
      { ...base, id: 'next-day', name: 'На следующий день', priceFromKzt: 90_000,
        busyDates: new Set<string>(['2026-11-14']) },
      { ...base, id: 'plus-budget', name: 'Чуть дороже', priceFromKzt: 110_000, busyDates: new Set<string>() },
      { ...base, id: 'wrong-event', name: 'Только корпоратив', priceFromKzt: 80_000,
        eventFormats: ['корпоратив'], busyDates: new Set<string>() });

    const result = await recommendations.recommend(dto({
      ...dense, date: '2026-11-14', eventFormat: 'свадьба', budgetKzt: 100_000,
    }));

    expect(result.status).toBe('matched');
    expect(result).toMatchObject({ count: 3, exactCount: 1, alternativeCount: 2 });
    expect(result.items.map((item) => item.id)).toEqual(['exact', 'next-day', 'plus-budget']);
    expect(result.items.map((item) => item.matchType)).toEqual(['exact', 'alternative', 'alternative']);
    expect(result.items[1]).toMatchObject({ availableDate: '2026-11-15', alternative: true });
    expect(result.items[1].differences).toEqual([expect.objectContaining({
      field: 'date', requested: '2026-11-14', offered: '2026-11-15',
    })]);
    expect(result.items[1].criteria.find((criterion) => criterion.key === 'date')).toMatchObject({
      status: 'different', requested: '14 ноября 2026 г.', offered: 'Свободен 15 ноября 2026 г.',
    });
    expect(result.items[2].differences).toEqual([expect.objectContaining({ field: 'budget', offered: 110_000 })]);
    expect(result.items[2].criteria.find((criterion) => criterion.key === 'budget')).toMatchObject({
      status: 'different', requested: 'до 100 000 ₸', offered: 'от 110 000 ₸',
    });
    expect(result.items.every((item) => item.id !== 'wrong-event')).toBe(true);
    expect(result.message).toContain('компромисс');
  });

  it('returns identical snapshots for repeat, restart and concurrent requests', async () => {
    const first = service();
    const spy = jest.spyOn(first.ai, 'analyze');
    const [a, b, c] = await Promise.all([
      first.recommendations.recommend(dto(dense)), first.recommendations.recommend(dto(dense)), first.recommendations.recommend(dto(dense)),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    const restarted = service();
    const restartSpy = jest.spyOn(restarted.ai, 'analyze');
    expect(await restarted.recommendations.recommend(dto(dense))).toEqual(a);
    expect(restartSpy).not.toHaveBeenCalled();
  });

  it('hard-filters before AI and preserves AI snapshots through restarts', async () => {
    const first = service();
    const eligible = first.matching.match(first.repo.contractors, dense).eligible;
    const rank = eligible.map((c, index) => ({ id: c.id, score: index,
      evidence: new ExplainerService().evidence(c.description, dense), reason: '' }));
    Object.defineProperty(first.ai, 'enabled', { value: true });
    const spy = jest.spyOn(first.ai, 'analyze').mockResolvedValue(rank);
    const [a, b] = await Promise.all([
      first.recommendations.recommend(dto(dense)), first.recommendations.recommend(dto(dense)),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].map((c) => c.id)).toEqual(eligible.map((c) => c.id));
    expect(spy.mock.calls[0][1].every((c) => !c.busyDates.has(dense.date) && c.priceFromKzt <= dense.budgetKzt)).toBe(true);
    expect(a).toEqual(b);
    expect(a.analysisMode).toBe('ai');
    expect(a.items.map((c) => c.id)).toEqual([...eligible].reverse().slice(0, 3).map((c) => c.id));
    for (const card of a.items) {
      const source = eligible.find((c) => c.id === card.id)!;
      expect(card).toMatchObject({ name: source.name, priceFromKzt: source.priceFromKzt,
        synthetic: source.synthetic, city_imputed: source.city_imputed, price_imputed: source.price_imputed });
    }
    const restarted = service();
    Object.defineProperty(restarted.ai, 'enabled', { value: true });
    const nextAi = jest.spyOn(restarted.ai, 'analyze').mockResolvedValue([...rank].reverse());
    expect(await restarted.recommendations.recommend(dto(dense))).toEqual(a);
    expect(nextAi).not.toHaveBeenCalled();
  });

  it('changes results for December and explains calendar exclusions', async () => {
    const { recommendations } = service();
    const october = await recommendations.recommend(dto(dense));
    const december = await recommendations.recommend(dto({ ...dense, date: '2026-12-20' }));
    expect(october.exclusions.busy).toBe(2);
    expect(december.exclusions.busy).toBe(8);
    expect(december.items.map((c) => c.id)).not.toEqual(october.items.map((c) => c.id));
    expect(december.message).toContain('8 заняты');
    expect(december.message).toContain('20 декабря 2026');
  });

  it('uses price then ID to resolve equal AI scores', async () => {
    const { repo, ai, recommendations } = service();
    const base = { ...repo.contractors[0], city: dense.city, categories: [dense.category],
      eventFormats: [dense.eventFormat], languages: [dense.language], busyDates: new Set<string>() };
    repo.contractors.splice(0, repo.contractors.length,
      { ...base, id: 'C', priceFromKzt: 200 }, { ...base, id: 'B', priceFromKzt: 100 }, { ...base, id: 'A', priceFromKzt: 100 });
    jest.spyOn(ai, 'analyze').mockResolvedValue(repo.contractors.map((c) => ({
      id: c.id, score: 50, evidence: 'Содержательное описание программы', reason: '',
    })));
    expect((await recommendations.recommend(dto(dense))).items.map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });

  it('recomputes corrupted snapshots instead of trusting modified prices or busy IDs', async () => {
    const { recommendations, ai } = service();
    const original = await recommendations.recommend(dto(dense));
    const file = join(directory, readdirSync(directory).find((name) => name.endsWith('.json'))!);
    const spy = jest.spyOn(ai, 'analyze');
    for (const changed of [
      { ...original, items: original.items.map((item, i) => i ? item : { ...item, priceFromKzt: 1 }) },
      { ...original, items: original.items.map((item, i) => i ? item : { ...item, id: 'HK-88430' }) },
    ]) {
      writeFileSync(file, JSON.stringify(changed));
      expect(await recommendations.recommend(dto(dense))).toEqual(original);
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('uses valid AI ranking, then falls back on invalid, refusal and timeout', async () => {
    const { ai, recommendations, repo, matching } = service();
    const eligible = matching.match(repo.contractors, dense).eligible;
    const valid = eligible.map((_c, i) => ({ candidateIndex: i, score: 100 - i,
      reason: 'Стиль программы учитывает корпоратив и совместный отдых гостей' }));
    const parse = jest.fn().mockResolvedValue({ status: 'completed', output_parsed: { rankings: valid } });
    Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
    Object.defineProperty(ai, 'enabled', { value: true });
    const result = await recommendations.recommend(dto(dense));
    expect(result.analysisMode).toBe('ai');
    expect(result.items[0].id).toBe(eligible[0].id);
    for (const [index, scenario] of [
      { status: 'completed', output_parsed: { rankings: [{ ...valid[0], candidateIndex: 999 }] } },
      { status: 'completed', output_parsed: null, output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
      { status: 'completed', output_parsed: { rankings: valid.map((rank, i) => i ? rank : { ...rank, reason: 'Отличный выбор для корпоратив' }) } },
    ].entries()) {
      parse.mockResolvedValueOnce(scenario);
      const next = await recommendations.recommend(dto({ ...dense, budgetKzt: dense.budgetKzt + index + 1 }));
      expect(next.analysisMode).toBe('fallback');
    }
    parse.mockRejectedValueOnce(new Error('timeout'));
    const timeout = await recommendations.recommend(dto({ ...dense, budgetKzt: 901000 }));
    expect(timeout.analysisMode).toBe('fallback');
  });
});

describe('HTTP contract', () => {
  let app: INestApplication;
  let directory: string;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'hackalem-http-'));
    process.env.CACHE_DIR = directory;
    delete process.env.OPENAI_API_KEY;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });

  it('serves health and catalog', async () => {
    const health = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(health.body).toEqual({ status: 'ok', contractors: 66 });
    const catalog = await request(app.getHttpServer()).get('/api/v1/catalog').expect(200);
    expect(catalog.body.calendar).toEqual({ from: '2026-09-23', to: '2026-12-31' });
    expect(catalog.body.cities).toContain('Алматы');
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-powered-by']).toBeUndefined();
    const preflight = await request(app.getHttpServer()).options('/api/v1/recommendations')
      .set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST').expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const swagger = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(swagger.body.paths['/api/v1/recommendations'].post).toBeDefined();
    expect(swagger.body.components.schemas.RecommendationRequestDto.properties.eventType).toBeDefined();
    expect(swagger.body.paths['/api/v1/recommendations'].post.requestBody.content['application/json'].schema.allOf[1].anyOf)
      .toEqual([{ required: ['eventType'] }, { required: ['eventFormat'] }]);
  });

  it('accepts eventType, shares its snapshot with eventFormat and rejects conflicting or absent formats', async () => {
    const { eventFormat, ...rest } = dense;
    const typed = await request(app.getHttpServer()).post('/api/v1/recommendations')
      .send({ ...rest, eventType: ' КОРПОРАТИВ ' }).expect(200);
    const legacy = await request(app.getHttpServer()).post('/api/v1/recommendations').send(dense).expect(200);
    expect(typed.body).toEqual(legacy.body);
    await request(app.getHttpServer()).post('/api/v1/recommendations')
      .send({ ...dense, eventType: eventFormat }).expect(200);
    for (const input of [rest, { ...dense, eventType: 'свадьба' },
      { ...rest, eventType: '' }, { ...rest, eventType: null }, { ...dense, eventType: null },
      { ...rest, eventType: 'корпоратив', eventFormat: null }]) {
      await request(app.getHttpServer()).post('/api/v1/recommendations').send(input).expect(400);
    }
  });

  it('normalizes requests and rejects invalid dates, budget and extra fields', async () => {
    const normalized = await request(app.getHttpServer()).post('/api/v1/recommendations')
      .send({ ...dense, city: '  АЛМАТЫ ', category: ' ведущий ' }).expect(200);
    expect(normalized.body.status).toBe('matched');
    for (const input of [
      { ...dense, date: '2026-02-30' }, { ...dense, date: '2027-01-01' },
      { ...dense, date: '2026-09-22' }, { ...dense, budgetKzt: 1.5 },
      { ...dense, durationHours: 25 }, { ...dense, extra: true },
      { ...dense, durationHours: null }, { ...dense, language: null },
    ]) await request(app.getHttpServer()).post('/api/v1/recommendations').send(input).expect(400);
  });
});
