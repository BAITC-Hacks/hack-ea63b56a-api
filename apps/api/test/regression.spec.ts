import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CsvLoaderService } from '../src/recommendations/csv-loader.service';
import { RecommendationRequestDto } from '../src/recommendations/dto/recommendation-request.dto';
import { ExplainerService } from '../src/recommendations/explainer.service';
import { OpenAiService } from '../src/recommendations/openai.service';
import { RecommenderService } from '../src/recommendations/recommender.service';
import { RequestParserService } from '../src/recommendations/request-parser.service';

const ai = {
  getStatus: () => ({ enabled: false, model: 'test' }),
  extractRequest: (): Promise<null> => Promise.resolve(null),
  explainRecommendations: (): Promise<null> => Promise.resolve(null)
} as unknown as OpenAiService;
const base = {
  city: 'Алматы', category: 'Ведущий', date: '2026-10-15',
  eventType: 'корпоратив', budgetKzt: 900000, durationHours: 5, language: 'русский'
};

describe('catalog and recommendation regression', () => {
  const loader = new CsvLoaderService();
  const service = new RecommenderService(loader, new ExplainerService(), ai);

  it('loads all 66 rows and preserves data-quality flags', () => {
    const rows = loader.getAll();
    expect(rows).toHaveLength(66);
    expect(rows.filter((row) => row.synthetic)).toHaveLength(13);
    expect(rows.filter((row) => row.cityImputed)).toHaveLength(8);
    expect(rows.filter((row) => row.priceImputed)).toHaveLength(18);
  });

  it('matches each part of compound categories and preserves null maxHours', async () => {
    const compound = loader.getAll().find((row) => row.categories.length > 1)!;
    expect(compound).toBeDefined();
    for (const category of compound.categories) {
      const result = await service.recommend({ ...base, city: compound.city, category });
      expect(result.totalConsidered).toBe(loader.getAll().filter((row) => row.city === compound.city && row.categories.includes(category)).length);
    }
    const unlimited = loader.getAll().find((row) => row.maxHours === null)!;
    const focused = { getAll: () => [unlimited] } as unknown as CsvLoaderService;
    const result = await new RecommenderService(focused, new ExplainerService(), ai).recommend({
      ...base, city: unlimited.city, category: unlimited.categories[0]!,
      eventType: unlimited.eventFormats[0]!, language: undefined,
      budgetKzt: unlimited.priceFromKzt, durationHours: 48
    });
    expect(result.items.map((row) => row.id)).toContain(unlimited.id);
  });

  it('changes availability in December and every returned card meets all hard filters', async () => {
    const october = await service.recommend(base);
    const december = await service.recommend({ ...base, date: '2026-12-20' });
    expect(october.items).toHaveLength(3);
    expect(december.items.map((row) => row.id)).not.toEqual(october.items.map((row) => row.id));
    for (const date of ['2026-10-15', '2026-12-20']) {
      const result = await service.recommend({ ...base, date });
      for (const item of result.items) {
        const row = loader.getAll().find((candidate) => candidate.id === item.id)!;
        expect(row.busyDates).not.toContain(date);
        expect(row.priceFromKzt).toBeLessThanOrEqual(base.budgetKzt);
        expect(row.eventFormats).toContain(base.eventType);
        expect(row.languages).toContain(base.language);
        expect(row.maxHours === null || row.maxHours >= base.durationHours).toBe(true);
        expect(item.synthetic).toBe(row.synthetic);
      }
    }
  });

  it('every proposed single-condition change actually produces candidates', async () => {
    const request = { ...base, budgetKzt: 1, durationHours: 48 };
    const result = await service.recommend(request);
    expect(result.suggestions).toEqual([]);
    for (const suggestion of result.suggestions) {
      const changed = { ...request };
      if (suggestion.type === 'budget') changed.budgetKzt = Number(suggestion.value);
      if (suggestion.type === 'duration') changed.durationHours = Number(suggestion.value);
      if (suggestion.type === 'language') changed.language = String(suggestion.value);
      if (String(suggestion.type) === 'date') changed.date = String(suggestion.value);
      expect((await service.recommend(changed)).items.length).toBeGreaterThan(0);
    }
  });

  it('offers the minimum sufficient budget and the suggestion restores results', async () => {
    const request = { ...base, budgetKzt: 1 };
    const result = await service.recommend(request);
    const budget = result.suggestions.find((suggestion) => suggestion.type === 'budget');
    expect(budget).toBeDefined();
    const amount = Number(budget!.value);
    expect((await service.recommend({ ...request, budgetKzt: amount })).items.length).toBeGreaterThan(0);
    expect((await service.recommend({ ...request, budgetKzt: amount - 1 })).items).toHaveLength(0);
  });

  it('requires every selected language rather than matching the combined string', async () => {
    const result = await service.recommend({ ...base, language: 'русский|казахский' });
    expect(result.items.length).toBeGreaterThan(0);
    for (const row of result.items) {
      expect(row.languages).toEqual(expect.arrayContaining(['русский', 'казахский']));
    }
  });

  it('does not reward a profile for a quality explicitly excluded in the wishes', async () => {
    const row = loader.getAll()[0]!;
    const focused = { getAll: () => [
      { ...row, id: 'a', description: 'Банальные конкурсы для гостей.' },
      { ...row, id: 'b', description: 'Интеллектуальная программа и импровизация.' }
    ] } as unknown as CsvLoaderService;
    const result = await new RecommenderService(focused, new ExplainerService(), ai).recommend({
      ...base, city: row.city, category: row.categories[0]!, eventType: row.eventFormats[0]!,
      budgetKzt: row.priceFromKzt, language: undefined, durationHours: undefined,
      wishes: 'без банальных конкурсов'
    });
    expect(result.items[0]!.id).toBe('b');
  });

  it('does not claim nonexistent contractors failed filters in a small category', async () => {
    const row = loader.getAll()[0]!;
    const focused = { getAll: () => [row] } as unknown as CsvLoaderService;
    const result = await new RecommenderService(focused, new ExplainerService(), ai).recommend({
      ...base, city: row.city, category: row.categories[0]!, eventType: row.eventFormats[0]!,
      budgetKzt: row.priceFromKzt, language: undefined, durationHours: undefined
    });
    expect(result.items).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
    expect(result.message).not.toContain('остальные не прошли');
  });

  it('suggests a free date when date is the only blocking condition', async () => {
    const row = loader.getAll().find((item) => item.busyDates.length > 0)!;
    const focused = { getAll: () => [row] } as unknown as CsvLoaderService;
    const result = await new RecommenderService(focused, new ExplainerService(), ai).recommend({
      ...base, city: row.city, category: row.categories[0]!, eventType: row.eventFormats[0]!,
      budgetKzt: row.priceFromKzt, date: row.busyDates[0]!, language: undefined, durationHours: undefined
    });
    expect(result.items).toHaveLength(0);
    expect(result.suggestions.some((item) => String(item.type) === 'date')).toBe(true);
  });
});

describe('fallback request parsing and validation', () => {
  const parser = new RequestParserService(new CsvLoaderService(), ai);

  it('understands the provided Russian photographer demo in inflected form', async () => {
    const result = await parser.parse('Нужен фотограф в Астане на свадьбу 14 ноября. Бюджет до 400 000 ₸, на 8 часов.');
    expect(result.parsed).toMatchObject({ city: 'Астана', eventType: 'свадьба', category: 'Фотограф', date: '2026-11-14', budgetKzt: 400000, durationHours: 8 });
    expect(result.missing).toEqual([]);
  });

  it('preserves a one-tenge budget for the empty-result demo', async () => {
    const result = await parser.parse('Нужен ведущий в Алматы на корпоратив 15 октября. Бюджет до 1 ₸, на 5 часов, русский язык.');
    expect(result.parsed.budgetKzt).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('preserves both requested languages', async () => {
    const result = await parser.parse('Нужен ведущий в Алматы на корпоратив 15 октября. Бюджет до 900000 ₸. Русский и казахский языки.');
    expect(result.parsed.language?.split('|')).toEqual(expect.arrayContaining(['русский', 'казахский']));
  });

  it('does not accept impossible dates as complete requests', async () => {
    const result = await parser.parse('Нужен ведущий в Алматы на корпоратив 31 февраля 2026. Бюджет до 900000 ₸.');
    expect(result.missing).toContain('date');
  });

  it.each(['2026-10-15T00:00:00Z', '2026-02-30'])('rejects non-calendar-day input %s', async (date) => {
    const errors = await validate(plainToInstance(RecommendationRequestDto, { ...base, date }));
    expect(errors.some((error) => error.property === 'date')).toBe(true);
  });

  it.each(['city', 'category', 'eventType'])('rejects whitespace-only required field %s', async (field) => {
    const errors = await validate(plainToInstance(RecommendationRequestDto, { ...base, [field]: '   ' }));
    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
