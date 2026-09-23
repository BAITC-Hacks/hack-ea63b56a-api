import { CsvLoaderService } from '../src/recommendations/csv-loader.service';
import { ExplainerService } from '../src/recommendations/explainer.service';
import { OpenAiService } from '../src/recommendations/openai.service';
import { RecommenderService } from '../src/recommendations/recommender.service';
import { Contractor, RecommendationStatus } from '../src/recommendations/recommendation.types';

const request = {
  city: 'Алматы', category: 'Ведущий', date: '2026-10-15',
  eventType: 'корпоратив', budgetKzt: 900000, durationHours: 5,
  language: 'русский|казахский', wishes: 'Современный стиль'
};
const row = (id: string, overrides: Partial<Contractor> = {}): Contractor => ({
  id, name: `Имя ${id}`, categories: ['Ведущий', 'Ведущий церемонии'], city: 'Алматы',
  cityImputed: false, synthetic: false, priceFromKzt: 300000, priceImputed: false,
  eventFormats: ['корпоратив'], languages: ['русский', 'казахский'], maxHours: 6,
  busyDates: [], description: 'Современный стиль: интерактивные викторины.', ...overrides
});
const serviceFor = (rows: Contractor[]): RecommenderService => new RecommenderService(
  { getAll: () => rows } as unknown as CsvLoaderService, new ExplainerService(),
  {
    getStatus: () => ({ enabled: false, model: 'offline-test' }),
    explainRecommendations: () => Promise.resolve(null)
  } as unknown as OpenAiService
);
const compact = (text: string): string => text.replace(/\s/g, '');

describe('user-facing explanation contract (offline)', () => {
  it.each([
    ['Мицури Канроджи', /сценари|интерактив|импровизац|оборудован|договор/i],
    ['Тэммари Собаку', /фотожурнализм|камер|съемк|сьемк/i],
    ['Нами', /15 лет|импровизац|интерактив|сценари/i],
    ['Кики', /казахском|русском|английском|форматы|свадьбы|конференции/i],
    ['Какаши Хатаке', /80 мероприятий|позирован|съёмки в другие/i],
    ['Мэгуми Фушигуро', /не про позы|состояние|взгляд|пауза|ненавязчив/i]
  ] as const)('uses a real distinguishing fact rather than the greeting of %s', async (name, fact) => {
    const contractor = new CsvLoaderService().getAll().find((item) => item.name === name)!;
    expect(contractor).toBeDefined();
    const date = ['2026-10-15', '2026-10-16', '2027-01-15'].find((value) => !contractor.busyDates.includes(value))!;
    const result = await serviceFor([contractor]).recommend({
      ...request, city: contractor.city, category: contractor.categories[0]!,
      date, eventType: contractor.eventFormats[0]!, budgetKzt: contractor.priceFromKzt,
      language: undefined, durationHours: undefined, wishes: ''
    });
    expect(result.items).toHaveLength(1);
    const text = result.items[0]!.explanation;
    expect(text).toMatch(fact);
    expect(text).not.toMatch(/привет|меня зовут|дорогу осилит/i);
    expect(text).not.toMatch(/индивидуальный подход|персональный подход|идеально выстроенное|уровень|важный день вашей жизни/i);
    const quotedFact = text.match(/В описании:\s*«(.+)»/u)?.[1];
    expect(quotedFact).toBeDefined();
    expect(contractor.description.toLowerCase().replace(/\s+/g, ' ')).toContain(
      quotedFact!.toLowerCase().replace(/\s+/g, ' '));
  });

  it('chooses the distinguishing skill after a shared first sentence for equally priced candidates', async () => {
    const shared = 'Современный стиль и интерактивы для гостей.';
    const rows = [
      row('a', { description: `${shared} Проводит научные эксперименты со зрителями.` }),
      row('b', { description: `${shared} Проводит музыкальные викторины с командными раундами.` }),
      row('c', { description: `${shared} Проводит театральные постановки с гостями.` })
    ];
    const result = await serviceFor(rows).recommend(request);
    const facts: Record<string, RegExp> = { a: /научные эксперименты/i, b: /музыкальные викторины/i, c: /театральные постановки/i };
    expect(result.items).toHaveLength(3);
    for (const item of result.items) expect(item.explanation).toMatch(facts[item.id]!);
    expect(new Set(result.items.map((item) => item.explanation)).size).toBe(3);
  });

  it('keeps individual profile evidence even when price and matching wish keywords are identical', async () => {
    const rows = [
      row('a', { description: 'Современный стиль: интерактивные викторины.' }),
      row('b', { description: 'Современный стиль: музыкальная импровизация.' }),
      row('c', { description: 'Современный стиль: научные эксперименты.' }),
      row('d', { description: 'Современный стиль: театральные постановки.' })
    ];
    const result = await serviceFor(rows).recommend(request);
    expect(result.status).toBe(RecommendationStatus.MATCHED);
    expect(result.items).toHaveLength(3);
    const distinguishingFacts: Record<string, RegExp> = {
      a: /викторин/i, b: /импровизац/i, c: /эксперимент/i, d: /постановк/i
    };
    for (const item of result.items) {
      expect(item.explanation).toMatch(distinguishingFacts[item.id]!);
      expect(item.explanation).not.toMatch(/отличный выбор|идеально подходит|профиль выделяется/i);
      expect(item.explanation.length).toBeLessThanOrEqual(500);
      const sentences = item.explanation.split(/[.!?](?:\s|$)/u).filter((part) => part.trim());
      expect(sentences.length).toBeGreaterThanOrEqual(1);
      expect(sentences.length).toBeLessThanOrEqual(2);
      expect(compact(item.explanation)).toContain('300000');
    }
    expect(new Set(result.items.map((item) => item.explanation.replace(item.name, ''))).size).toBe(3);
  });

  it('does not turn starting prices and unmarked dates into confirmed booking promises', async () => {
    const result = await serviceFor([row('estimated', { priceImputed: true })]).recommend(request);
    const text = result.items[0]!.explanation;
    expect(text).not.toMatch(/(?:^|[.!?]\s*)Свободен|гарантирован|с запасом|экономи[яит]/i);
    expect(text).toMatch(/ориентир|оценоч|уточн/i);
    expect(compact(text)).toContain('300000');
  });

  it('never invents unlimited on-site work from null maxHours', async () => {
    const result = await serviceFor([row('remote', { maxHours: null })]).recommend({ ...request, durationHours: 48 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.explanation).not.toMatch(/может работать.*48|48.*час.*(?:работ|присутств)|неограниченн/i);
  });

  it('all card facts match catalog data and every requested hard condition is met', async () => {
    const rows = [row('ok'), row('busy', { busyDates: [request.date] }),
      row('expensive', { priceFromKzt: 900001 }), row('format', { eventFormats: ['свадьба'] }),
      row('short', { maxHours: 4 }), row('language', { languages: ['русский'] })];
    const result = await serviceFor(rows).recommend(request);
    expect(result.items.map((item) => item.id)).toEqual(['ok']);
    expect(result.items[0]).toMatchObject({
      name: rows[0]!.name, categories: rows[0]!.categories, city: rows[0]!.city,
      priceFromKzt: rows[0]!.priceFromKzt, maxHours: rows[0]!.maxHours,
      languages: rows[0]!.languages, eventFormats: rows[0]!.eventFormats
    });
    expect(result.filterSummary.map((item) => item.code).sort()).toEqual(
      ['busy', 'duration', 'event_format', 'language', 'over_budget']);
    expect(result.message).toMatch(/1/);
    expect(result.message).toMatch(/занят|дат/i);
    expect(result.message).toMatch(/бюджет/i);
    expect(result.message).toMatch(/формат/i);
  });

  it('explains a scarce category without inventing rejected candidates', async () => {
    const result = await serviceFor([row('a'), row('b')]).recommend(request);
    expect(result.items).toHaveLength(2);
    expect(result.message).toMatch(/2/);
    expect(result.message).toMatch(/все|всего|только/i);
    expect(result.message).not.toMatch(/занят|превышают|не прошли/i);
    expect(result.excluded).toEqual([]);
  });

  it('distinguishes missing category from existing candidates blocked by overlapping conditions', async () => {
    const missing = await serviceFor([row('other', { city: 'Астана' })]).recommend(request);
    const blocked = await serviceFor([row('blocked', {
      busyDates: [request.date], priceFromKzt: 950000, eventFormats: ['свадьба']
    })]).recommend(request);
    expect(missing.status).toBe(RecommendationStatus.NO_CATEGORY_IN_CITY);
    expect(missing.message).toMatch(/Алматы/);
    expect(missing.message).toMatch(/Ведущий/);
    expect(missing.message).toMatch(/нет|не найден/i);
    expect(missing.totalConsidered).toBe(0);
    expect(blocked.status).toBe(RecommendationStatus.NO_CANDIDATES_AFTER_FILTERS);
    expect(blocked.items).toEqual([]);
    expect(blocked.totalConsidered).toBe(1);
    expect(blocked.excluded).toHaveLength(1);
    expect(blocked.message).toMatch(/занят|дат/i);
    expect(blocked.message).toMatch(/бюджет/i);
    expect(blocked.message).toMatch(/формат/i);
    expect(blocked.filterSummary.every((reason) => reason.count === 1)).toBe(true);
  });
});
