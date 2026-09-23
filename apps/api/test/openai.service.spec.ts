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
    const explanation = 'Свободен 15 октября, цена от 100 000 ₸ укладывается в бюджет.';
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{ id: 'known', explanation }] }) });
    expect(await new OpenAiService().explainRecommendations(request, items)).toEqual(new Map([['known', explanation]]));
  });

  it('rejects explanations that omit expected candidates', async () => {
    create.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ items: [{ id: 'unknown', explanation: 'Достаточно длинное объяснение чужой карточки.' }] }) });
    expect(await new OpenAiService().explainRecommendations(request, items)).toBeNull();
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
