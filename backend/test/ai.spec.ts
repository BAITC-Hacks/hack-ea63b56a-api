import { AiService } from '../src/ai/ai.service';
import { Contractor, RequestCriteria } from '../src/common/domain';

const criteria: RequestCriteria = {
  city: 'Алматы', date: '2026-10-15', eventFormat: 'корпоратив', category: 'Ведущий', budgetKzt: 900000,
};
const candidate: Contractor = {
  id: 'eligible', name: 'Ведущий', categories: ['Ведущий'], city: 'Алматы',
  synthetic: false, city_imputed: false, price_imputed: true, priceFromKzt: 100000,
  eventFormats: ['корпоратив'], languages: ['русский'], maxHours: 6, busyDates: new Set(),
  description: 'Интерактивные программы для команды и деловых событий',
};
const modelRank = {
  candidateIndex: 0, score: 80,
  reason: 'Интерактивная программа вовлекает команду в корпоратив',
};
const rank = {
  id: candidate.id, score: modelRank.score, reason: modelRank.reason, evidence: candidate.description,
};

function analyzer(output: unknown = { rankings: [modelRank] }, status = 'completed') {
  const ai = new AiService();
  const parse = jest.fn().mockResolvedValue({ status, output_parsed: output });
  Object.defineProperty(ai, 'client', { value: { responses: { parse } } });
  return { ai, parse };
}

describe('AI boundary (offline SDK mocks)', () => {
  const environment = { ...process.env };
  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_TIMEOUT_MS = '7000';
  });
  afterEach(() => { process.env = { ...environment }; jest.useRealTimers(); });

  it('does not need a credential to return fallback', async () => {
    const ai = new AiService();
    expect(ai.enabled).toBe(false);
    expect(await ai.analyze(criteria, [candidate])).toBeNull();
  });

  it('uses Responses parse with a strict schema, no storage and only supplied candidates', async () => {
    const { ai, parse } = analyzer();
    expect(await ai.analyze(criteria, [candidate])).toEqual([rank]);
    const [body, options] = parse.mock.calls[0];
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const payload = JSON.parse(body.input[1].content);
    expect(payload.candidates.map((c: { candidateIndex: number }) => c.candidateIndex)).toEqual([0]);
    expect(payload.candidates[0].id).toBeUndefined();
    expect(payload.candidates[0].priceFromKzt).toBe(100000);
  });

  it.each([
    ['unknown candidate index', { ...modelRank, candidateIndex: 99 }],
    ['negative score', { ...modelRank, score: -1 }],
    ['score above limit', { ...modelRank, score: 101 }],
    ['NaN score', { ...modelRank, score: NaN }],
    ['infinite score', { ...modelRank, score: Infinity }],
    ['string score', { ...modelRank, score: '80' }],
    ['changed price', { ...modelRank, priceFromKzt: 1 }],
    ['changed name', { ...modelRank, name: 'invented' }],
    ['generic explanation', { ...modelRank, reason: 'Отличный выбор для мероприятия корпоратив' }],
    ['price in explanation', { ...modelRank, reason: 'Корпоратив стоит всего 100 тенге' }],
    ['invented discount', { ...modelRank, reason: 'Корпоратив включает бесплатное оформление' }],
    ['invented language', { ...modelRank, reason: 'Корпоратив проходит на английском языке' }],
    ['unrelated event', { ...modelRank, reason: 'Программа подходит для свадьбы и юбилея' }],
  ])('rejects %s and returns fallback', async (_label, invalid) => {
    const { ai } = analyzer({ rankings: [invalid] });
    expect(await ai.analyze(criteria, [candidate])).toBeNull();
  });

  it.each([
    ['refusal', null, 'completed'],
    ['incomplete', { rankings: [modelRank] }, 'incomplete'],
    ['missing candidates', { rankings: [] }, 'completed'],
    ['duplicate candidate index', { rankings: [modelRank, modelRank] }, 'completed'],
    ['invalid schema', { items: [modelRank] }, 'completed'],
  ])('handles %s', async (_label, output, status) => {
    const { ai } = analyzer(output, status);
    expect(await ai.analyze(criteria, [candidate])).toBeNull();
  });

  it('rejects duplicate candidate indexes even when the total candidate count matches', async () => {
    const { ai } = analyzer({ rankings: [modelRank, modelRank] });
    expect(await ai.analyze(criteria, [candidate, { ...candidate, id: 'second' }])).toBeNull();
  });

  it('derives evidence from source descriptions instead of model output', async () => {
    const second = { ...candidate, id: 'second', description: 'Опыт проведения деловых форумов и командных сессий' };
    const { ai } = analyzer({ rankings: [modelRank, { ...modelRank, candidateIndex: 1 }] });
    const result = await ai.analyze(criteria, [candidate, second]);
    expect(result?.map((item) => item.evidence)).toEqual([candidate.description, second.description]);
  });

  it('never calls OpenAI for empty input', async () => {
    const { ai, parse } = analyzer();
    expect(await ai.analyze(criteria, [])).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('aborts a hung SDK call at the configured deadline and clears its timer', async () => {
    jest.useFakeTimers();
    const { ai, parse } = analyzer();
    parse.mockImplementation(() => new Promise(() => undefined));
    const result = ai.analyze(criteria, [candidate]);
    await jest.advanceTimersByTimeAsync(7000);
    expect(await result).toBeNull();
    expect(parse.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('handles SDK errors without exposing error payloads', async () => {
    const { ai, parse } = analyzer();
    parse.mockRejectedValue(new Error('rate limited'));
    expect(await ai.analyze(criteria, [candidate])).toBeNull();
  });
});
