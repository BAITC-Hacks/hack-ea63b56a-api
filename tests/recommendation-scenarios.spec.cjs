const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { AiService } = require('../backend/src/ai/ai.service');
const { MatchingService } = require('../backend/src/matching/matching.service');
const { ExplainerService } = require('../backend/src/recommendations/explainer.service');
const { RecommendationsService } = require('../backend/src/recommendations/recommendations.service');
const { RecommendationRequestDto } = require('../backend/src/recommendations/recommendation.dto');
const { SnapshotService } = require('../backend/src/recommendations/snapshot.service');

const criteria = {
  city: 'Алматы', date: '2026-10-15', eventFormat: 'корпоратив',
  category: 'Ведущий', budgetKzt: 500000, language: 'русский', durationHours: 6,
};

// Copy edits must not hide a false claim or break a check of its meaning.
const plainText = (value) => value.normalize('NFKC').toLocaleLowerCase('ru')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function contractor(overrides = {}) {
  return {
    id: 'fixture', name: 'Тестовый ведущий', categories: ['Ведущий'], city: 'Алматы',
    synthetic: true, city_imputed: false, price_imputed: false,
    priceFromKzt: 500000, eventFormats: ['корпоратив'], languages: ['русский'],
    maxHours: 6, busyDates: new Set(), description: 'Интерактивные программы для команды.',
    ...overrides,
  };
}

function service(candidates, parse = jest.fn()) {
  const ai = new AiService();
  Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
  Object.defineProperty(ai, 'enabled', { value: true });
  const recommendations = new RecommendationsService(
    { contractors: candidates, datasetHash: 'scenario-fixtures-v1' },
    new MatchingService(), ai, new ExplainerService(), new SnapshotService(),
  );
  return {
    parse,
    recommend: (changes = {}) => recommendations.recommend(
      Object.assign(new RecommendationRequestDto(), criteria, changes),
    ),
  };
}

describe('Recommendation scenarios through matching, AI, explanations and snapshots', () => {
  const environment = { ...process.env };
  let directory;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'hackalem-scenarios-'));
    process.env.CACHE_DIR = directory;
    process.env.OPENAI_API_KEY = '';
    process.env.OPENAI_TIMEOUT_MS = '7000';
  });
  afterEach(() => {
    process.env = { ...environment };
    rmSync(directory, { recursive: true, force: true });
  });

  it('reports all five mismatches for one profile and never sends it to AI', async () => {
    const app = service([contractor({
      priceFromKzt: 600000, eventFormats: ['свадьба'], languages: ['английский'],
      maxHours: 4, busyDates: new Set([criteria.date]),
    })]);
    const result = await app.recommend();
    expect(result).toMatchObject({
      status: 'no_candidates_after_filters', analysisMode: 'not_needed',
      totalCandidates: 1, eligibleCount: 0, count: 0, items: [],
      exclusions: { busy: 1, budget: 1, format: 1, language: 1, duration: 1 },
    });
    for (const reason of [/1\s+занят/u, /1[^.;]*бюджет/u, /1[^.;]*формат/u,
      /1[^.;]*язык/u, /1[^.;]*(?:длительност|час)/u]) {
      expect(result.message).toMatch(reason);
    }
    expect(app.parse).not.toHaveBeenCalled();
  });

  it('includes exact budget/hour limits, but excludes one tenge or a fraction of an hour over them', async () => {
    const parse = jest.fn().mockRejectedValue(new Error('Simulated provider outage'));
    const app = service([contractor()], parse);
    const exact = await app.recommend();
    expect(exact).toMatchObject({ status: 'matched', count: 1, analysisMode: 'fallback' });
    expect(exact.items[0].id).toBe('fixture');
    const underBudget = await app.recommend({ budgetKzt: 499999 });
    expect(underBudget).toMatchObject({ status: 'no_candidates_after_filters', count: 0 });
    expect(underBudget.exclusions).toEqual({ busy: 0, budget: 1, format: 0, language: 0, duration: 0 });
    const overHours = await app.recommend({ durationHours: 6.01 });
    expect(overHours).toMatchObject({ status: 'no_candidates_after_filters', count: 0 });
    expect(overHours.exclusions).toEqual({ busy: 0, budget: 0, format: 0, language: 0, duration: 1 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('keeps identity, source evidence and score together when the model shuffles four candidates', async () => {
    const descriptions = [
      'Интерактивные программы для команды.', 'Деловые викторины для коллег.',
      'Музыкальные конкурсы для сотрудников.', 'Командные игры для участников.',
    ];
    const candidates = descriptions.map((description, i) => contractor({
      id: `profile-${i}`, name: `Профиль ${i}`, description,
    }));
    const scores = [80, 70, 40, 90];
    const parse = jest.fn().mockResolvedValue({ status: 'completed', output_parsed: {
      rankings: [2, 0, 3, 1].map((index) => ({ candidateIndex: index, score: scores[index],
        reason: `Для формата корпоратив подходят ${descriptions[index].toLowerCase()}` })),
    } });
    const app = service(candidates, parse);
    const result = await app.recommend();
    expect(result).toMatchObject({ count: 3, eligibleCount: 4, analysisMode: 'ai' });
    expect(result.items.map((item) => item.id)).toEqual(['profile-3', 'profile-0', 'profile-1']);
    for (const item of result.items) {
      const source = candidates.find((candidate) => candidate.id === item.id);
      expect(item.name).toBe(source.name);
      expect(item.explanation).toContain(source.description.replace(/\.$/, ''));
      expect(plainText(item.explanation)).toContain(plainText(source.description));
    }
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('does not mix concurrent requests with different budgets and languages when AI finishes out of order', async () => {
    const pending = [];
    let bothStarted;
    const ready = new Promise((resolve) => { bothStarted = resolve; });
    const parse = jest.fn((body) => new Promise((resolve) => {
      pending.push({ payload: JSON.parse(body.input[1].content), resolve });
      if (pending.length === 2) bothStarted();
    }));
    const app = service([
      contractor({ id: 'english', priceFromKzt: 150000, languages: ['английский'] }),
      contractor({ id: 'russian', priceFromKzt: 500000, languages: ['русский'] }),
    ], parse);
    const english = app.recommend({ language: 'английский', budgetKzt: 150000 });
    const russian = app.recommend({ language: 'русский', budgetKzt: 500000 });
    // Bind the completion order to request contents, independent of filesystem scheduling.
    await ready;
    const answer = { status: 'completed', output_parsed: { rankings: [{
      candidateIndex: 0, score: 80, reason: 'Интерактивные программы вовлекают команду в корпоратив',
    }] } };
    pending.find(({ payload }) => payload.request.language === 'русский').resolve(answer);
    const russianResult = await russian;
    pending.find(({ payload }) => payload.request.language === 'английский').resolve(answer);
    const englishResult = await english;
    const exactIds = (result) => result.items.filter((item) => !item.alternative).map((item) => item.id);
    expect(exactIds(russianResult)).toEqual(['russian']);
    expect(exactIds(englishResult)).toEqual(['english']);
    expect(russianResult.items[0].explanation).toContain('русский');
    expect(englishResult.items[0].explanation).toContain('английский');
    expect(await app.recommend({ language: 'английский', budgetKzt: 150000 })).toEqual(englishResult);
    expect(await app.recommend({ language: 'русский', budgetKzt: 500000 })).toEqual(russianResult);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  // These are acceptance checks, not simulations of actual model behaviour.
  // They must fail if an unsupported model claim reaches the user-facing card.
  it.each([
    ['an invented service', 'Корпоратив включает лазерное шоу с дрессированными тиграми.'],
    ['an unsupported language', 'Корпоратив проводится на французском языке.'],
    ['an unsupported availability promise', 'Для формата корпоратив команда свободна в любой день.'],
  ])('does not publish %s from a schema-valid model response', async (_label, reason) => {
    const parse = jest.fn().mockResolvedValue({ status: 'completed', output_parsed: {
      rankings: [{ candidateIndex: 0, score: 99, reason }],
    } });
    const app = service([contractor({ busyDates: new Set(['2026-10-16']) })], parse);
    const result = await app.recommend();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'matched', count: 1 });
    expect(result.items[0].id).toBe('fixture');
    // Accept either safe rewriting or fallback; reject publication of the false claim.
    expect(plainText(result.items[0].explanation)).not.toContain(plainText(reason));
  });
});
