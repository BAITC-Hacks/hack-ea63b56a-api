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
