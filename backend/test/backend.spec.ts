import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
  });

  it('checks independent calendar population before other filters', () => {
    const base = { ...dense, budgetKzt: 9_000_000, language: undefined };
    const oct = matching.match(repo.contractors, base);
    const dec = matching.match(repo.contractors, { ...base, date: '2026-12-20' });
    expect(oct.population).toHaveLength(10);
    expect(oct.population.filter((c) => !c.busyDates.has('2026-10-15'))).toHaveLength(8);
    expect(dec.population.filter((c) => !c.busyDates.has('2026-12-20'))).toHaveLength(2);
    expect(matching.match(repo.contractors, { ...base, city: 'Астана', category: 'Флорист', date: '2026-11-14' }).population).toHaveLength(1);
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
      expect(item.explanation).toContain(dense.date);
      expect(item.explanation).toContain('900');
      expect(item.explanation).toContain('корпоратив');
      const quote = item.explanation.match(/В описании: «(.+)»/u)?.[1];
      expect(repo.contractors.find((c) => c.id === item.id)!.description.replace(/\s+/g, ' ')).toContain(quote);
    }
    expect(new Set(matched.items.map((item) => item.explanation)).size).toBe(matched.count);

    const rare = await recommendations.recommend(dto({ ...dense, city: 'Астана', date: '2026-11-14', category: 'Флорист' }));
    expect(rare.totalCandidates).toBe(1);
    expect(rare.count).toBeLessThanOrEqual(1);
    expect(rare.message).toMatch(/из 3/);
    const absent = await recommendations.recommend(dto({ ...dense, city: 'Астана', category: 'Инструменталист' }));
    expect(absent.status).toBe('no_category_in_city');
    expect(absent.analysisMode).toBe('not_needed');
    const filtered = await recommendations.recommend(dto({ ...dense, budgetKzt: 1 }));
    expect(filtered.status).toBe('no_candidates_after_filters');
    expect(filtered.exclusions.budget).toBe(10);
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

  it('uses valid AI ranking, then falls back on invalid, refusal and timeout', async () => {
    const { ai, recommendations, repo, matching } = service();
    const eligible = matching.match(repo.contractors, dense).eligible;
    const valid = eligible.map((c, i) => ({ id: c.id, score: 100 - i,
      evidence: new ExplainerService().evidence(c.description, dense), reason: 'Стиль программы учитывает корпоратив и совместный отдых гостей' }));
    const parse = jest.fn().mockResolvedValue({ status: 'completed', output_parsed: { rankings: valid } });
    Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
    Object.defineProperty(ai, 'enabled', { value: true });
    const result = await recommendations.recommend(dto(dense));
    expect(result.analysisMode).toBe('ai');
    expect(result.items[0].id).toBe(valid[0].id);
    for (const [index, scenario] of [
      { status: 'completed', output_parsed: { rankings: [{ ...valid[0], id: 'invented' }] } },
      { status: 'completed', output_parsed: null, output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
      { status: 'completed', output_parsed: { rankings: valid.map((rank, i) => i ? rank : { ...rank, evidence: 'выдуманная цитата' }) } },
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
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });

  it('serves health and catalog', async () => {
    const health = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(health.body).toEqual({ status: 'ok', contractors: 66 });
    const catalog = await request(app.getHttpServer()).get('/api/v1/catalog').expect(200);
    expect(catalog.body.calendar).toEqual({ from: '2026-09-23', to: '2026-12-31' });
    expect(catalog.body.cities).toContain('Алматы');
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
