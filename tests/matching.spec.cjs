const { MatchingService } = require('../backend/src/matching/matching.service');

const criteria = {
  city: 'Алматы', date: '2026-10-15', eventFormat: 'корпоратив',
  category: 'Ведущий', budgetKzt: 500000, language: 'русский',
};

function contractor(overrides = {}) {
  return {
    id: 'test-contractor', name: 'Тестовый ведущий', city: 'Алматы',
    categories: ['Ведущий'], eventFormats: ['корпоратив'], languages: ['русский'],
    priceFromKzt: 500000, maxHours: null, busyDates: new Set(),
    synthetic: true, city_imputed: false, price_imputed: false,
    description: 'Синтетический профиль для проверки условий подбора.',
    ...overrides,
  };
}

describe('Budget and language must match the same contractor', () => {
  const matching = new MatchingService();

  it('counts both reasons when one contractor fails budget and language', () => {
    const candidate = contractor({ priceFromKzt: 600000, languages: ['английский'] });
    const result = matching.match([candidate], criteria);

    expect(result.population.map(({ id }) => id)).toEqual([candidate.id]);
    expect(result.eligible).toEqual([]);
    expect(result.exclusions).toEqual({ busy: 0, budget: 1, format: 0, language: 1, duration: 0 });
    // Changing just one constraint still leaves the other unsatisfied.
    expect(matching.match([candidate], { ...criteria, budgetKzt: 600000 }).eligible).toEqual([]);
    expect(matching.match([candidate], { ...criteria, language: 'английский' }).eligible).toEqual([]);
    expect(matching.match([candidate], { ...criteria, budgetKzt: 600000, language: 'английский' }).eligible)
      .toEqual([candidate]);
  });

  it('does not combine a matching price from one profile with a language from another', () => {
    const affordable = contractor({ id: 'affordable', languages: ['английский'] });
    const russianSpeaking = contractor({ id: 'russian-speaking', priceFromKzt: 600000 });
    const result = matching.match([affordable, russianSpeaking], criteria);

    expect(result.population.map(({ id }) => id)).toEqual(['affordable', 'russian-speaking']);
    expect(result.eligible).toEqual([]);
    expect(result.exclusions).toEqual({ busy: 0, budget: 1, format: 0, language: 1, duration: 0 });
    // A profile satisfying both constraints must be admitted.
    const suitable = contractor({ id: 'suitable' });
    expect(matching.match([affordable, russianSpeaking, suitable], criteria).eligible).toEqual([suitable]);
  });
});

describe('Closest alternatives', () => {
  const matching = new MatchingService();
  const wedding = { ...criteria, date: '2026-11-14', eventFormat: 'свадьба', budgetKzt: 100000 };

  it('prefers the nearest free date and never changes the event format', () => {
    const exact = contractor({ id: 'exact', eventFormats: ['свадьба'], priceFromKzt: 90000 });
    const nextDay = contractor({
      id: 'next-day', eventFormats: ['свадьба'], priceFromKzt: 90000,
      busyDates: new Set(['2026-11-14']),
    });
    const later = contractor({
      id: 'later', eventFormats: ['свадьба'], priceFromKzt: 90000,
      busyDates: new Set(['2026-11-14', '2026-11-15']),
    });
    const corporate = contractor({ id: 'wrong-event', eventFormats: ['корпоратив'], priceFromKzt: 90000 });
    const alternatives = matching.alternatives([exact, nextDay, later, corporate], wedding, new Set(['exact']));

    expect(alternatives.map(({ contractor: item }) => item.id)).toEqual(['next-day', 'later']);
    expect(alternatives[0].availableDate).toBe('2026-11-15');
    expect(alternatives[0].differences).toEqual([expect.objectContaining({
      field: 'date', requested: '2026-11-14', offered: '2026-11-15',
    })]);
    expect(alternatives.some(({ contractor: item }) => item.id === corporate.id)).toBe(false);
  });

  it('orders moderate budget alternatives by the smallest overage', () => {
    const alternatives = matching.alternatives([
      contractor({ id: 'plus-20', eventFormats: ['свадьба'], priceFromKzt: 120000 }),
      contractor({ id: 'plus-10', eventFormats: ['свадьба'], priceFromKzt: 110000 }),
      contractor({ id: 'too-expensive', eventFormats: ['свадьба'], priceFromKzt: 150000 }),
    ], wedding, new Set());

    expect(alternatives.map(({ contractor: item }) => item.id)).toEqual(['plus-10', 'plus-20']);
    expect(alternatives[0].differences[0]).toMatchObject({ field: 'budget', offered: 110000 });
  });
});
