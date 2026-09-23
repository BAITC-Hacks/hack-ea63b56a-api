import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { OpenAiService } from '../src/recommendations/openai.service';
import { RecommendationItemDto } from '../src/recommendations/dto/recommendation-response.dto';

jest.mock('openai', () => ({ __esModule: true, default: Object.assign(jest.fn(), { APIError: class extends Error {} }) }));

describe('OpenAI service with an offline SDK mock', () => {
  const create = jest.fn();
  const metadata = { cities: ['Алматы'], categories: ['Ведущий'], eventTypes: ['корпоратив'], languages: ['русский'] };
  const request = { city: 'Алматы', category: 'Ведущий', eventType: 'корпоратив', budgetKzt: 900000, date: '2026-10-15' };
  const extracted = { ...request, language: 'русский', durationHours: 5, wishes: 'юмор' };
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.OPENAI_API_KEY;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  beforeEach(() => {
    create.mockReset();
    (OpenAI as unknown as jest.Mock).mockClear();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({ responses: { create } }));
    process.env.OPENAI_API_KEY = 'offline-unit-test-placeholder';
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it('normalizes successful extraction to catalog values', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ ...extracted, city: 'алматы', category: 'ведущий' }) });
    const result = await new OpenAiService().extractRequest('offline text', metadata);
    expect(result).toMatchObject(extracted);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'refusal', 'malformed'])('returns fallback signal on %s', async (kind) => {
    if (kind === 'error') create.mockRejectedValue(new Error('offline transport failure'));
    else create.mockResolvedValue({ status: 'completed', output_text: kind === 'refusal' ? '' : '{broken' });
    expect(await new OpenAiService().extractRequest('offline text', metadata)).toBeNull();
  });

  it('drops an impossible date from model extraction', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ ...extracted, date: '2026-02-31' }) });
    expect((await new OpenAiService().extractRequest('offline text', metadata))?.date).toBeUndefined();
  });

  const items = [{
    id: 'known', name: 'Test', categories: ['Ведущий'], city: 'Алматы',
    cityImputed: false, description: 'Интеллектуальный юмор.', eventFormats: ['корпоратив'],
    explanation: 'Локальное объяснение по известным фактам.', languages: ['русский'],
    maxHours: 6, priceFromKzt: 100000, priceImputed: false, score: 70, synthetic: true
  }] satisfies RecommendationItemDto[];

  it('accepts complete explanations for expected candidates', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{ id: 'known', evidenceId: 0 }] }) });
    const result = await new OpenAiService().explainRecommendations(request, items);
    expect(result).not.toBeNull();
    expect(result!.get('known')).toMatch(/Интеллектуальный юмор/i);
    expect(result!.get('known')!.replace(/\s/g, '')).toContain('100000');
  });

  it('rejects explanations that omit expected candidates', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{ id: 'unknown', evidenceId: 0 }] }) });
    expect(await new OpenAiService().explainRecommendations(request, items)).toBeNull();
  });

  it.each([-1, 999, 0.5, '0', null])('rejects invalid evidence selector %s', async (evidenceId) => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{ id: 'known', evidenceId }] }) });
    expect(await new OpenAiService().explainRecommendations(request, items)).toBeNull();
  });

  it('does not display invented prose supplied by the model instead of factual evidence', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{
      id: 'known', explanation: 'Гарантированно свободен, бесплатно работает 24 часа и говорит на японском.'
    }] }) });
    expect(await new OpenAiService().explainRecommendations(request, items)).toBeNull();
  });

  it('rejects duplicate candidate ids even when the result length matches', async () => {
    const pair = [items[0]!, { ...items[0]!, id: 'second', description: 'Музыкальные викторины.' }];
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [
      { id: 'known', evidenceId: 0 }, { id: 'known', evidenceId: 0 }
    ] }) });
    expect(await new OpenAiService().explainRecommendations(request, pair)).toBeNull();
  });

  it('cannot attach another candidate evidence using the same selector', async () => {
    const pair = [items[0]!, { ...items[0]!, id: 'second', description: 'Музыкальные викторины.' }];
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [
      { id: 'known', evidenceId: 0 }, { id: 'second', evidenceId: 0 }
    ] }) });
    const result = await new OpenAiService().explainRecommendations(request, pair);
    expect(result).not.toBeNull();
    expect(result!.get('known')).toMatch(/Интеллектуальный юмор/i);
    expect(result!.get('known')).not.toMatch(/Музыкальные викторины/i);
    expect(result!.get('second')).toMatch(/Музыкальные викторины/i);
  });

  it('offers only distinguishing evidence to the model when candidates share their introduction', async () => {
    const shared = 'Современный стиль и интерактивы для гостей.';
    const pair = [
      { ...items[0]!, description: `${shared} Проводит научные эксперименты со зрителями.` },
      { ...items[0]!, id: 'second', description: `${shared} Проводит музыкальные викторины с командными раундами.` }
    ];
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [
      { id: 'known', evidenceId: 0 }, { id: 'second', evidenceId: 0 }
    ] }) });
    const result = await new OpenAiService().explainRecommendations(request, pair);
    expect(result).not.toBeNull();
    expect(result!.get('known')).toMatch(/научные эксперименты/i);
    expect(result!.get('second')).toMatch(/музыкальные викторины/i);
    const calls = create.mock.calls as Array<[{ input: string }]>;
    const input = JSON.parse(calls[0]![0].input) as {
      candidates: Array<{ evidence: Array<{ text: string }> }>
    };
    expect(input.candidates).toHaveLength(2);
    for (const candidate of input.candidates) {
      expect(candidate.evidence.length).toBeGreaterThan(0);
      expect(candidate.evidence.some((entry) => entry.text.includes('Современный стиль'))).toBe(false);
    }
  });

  it('does not instantiate or call the SDK when no key is configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new OpenAiService();
    expect(await service.extractRequest('offline text', metadata)).toBeNull();
    expect(await service.explainRecommendations(request, items)).toBeNull();
    expect(OpenAI).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
