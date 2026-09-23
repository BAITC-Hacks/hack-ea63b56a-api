import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { isISO8601 } from 'class-validator';
import { RecommendationRequestDto } from './dto/recommendation-request.dto';
import { RecommendationItemDto } from './dto/recommendation-response.dto';

interface CatalogMetadata {
  cities: string[];
  categories: string[];
  eventTypes: string[];
  languages: string[];
}

export interface AiParsedRequest {
  city?: string;
  date?: string;
  eventType?: string;
  category?: string;
  budgetKzt?: number;
  durationHours?: number;
  language?: string;
  wishes?: string;
}

interface StructuredParsedRequest {
  city: string | null;
  date: string | null;
  eventType: string | null;
  category: string | null;
  budgetKzt: number | null;
  durationHours: number | null;
  language: string | null;
  wishes: string | null;
}

interface StructuredExplanations {
  items: Array<{ id: string; explanation: string }>;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI | null;
  private readonly model = process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey
      ? new OpenAI({ apiKey, maxRetries: 0, timeout: 8_000 })
      : null;
  }

  getStatus(): { enabled: boolean; model: string } {
    return { enabled: this.client !== null, model: this.model };
  }

  async extractRequest(text: string, metadata: CatalogMetadata): Promise<AiParsedRequest | null> {
    if (!this.client) return null;

    try {
      const response = await this.client.responses.create({
        max_output_tokens: 600,
        input: JSON.stringify({ catalog: metadata, request: text }),
        instructions: [
          'Извлеки параметры event-заказа из русского пользовательского текста.',
          'Выбирай город, категорию, тип мероприятия и язык только из значений catalog.',
          'Если нужны несколько языков, объедини их в поле language через |.',
          'Не выдумывай отсутствующие данные: возвращай null.',
          'Если год даты не указан, используй 2026.',
          'wishes — только пожелания к стилю и содержанию, без уже выделенных параметров.'
        ].join(' '),
        model: this.model,
        reasoning: { effort: 'none' },
        text: {
          format: {
            name: 'event_request',
            schema: {
              additionalProperties: false,
              properties: {
                budgetKzt: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
                category: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                city: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                durationHours: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
                eventType: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                language: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                wishes: { anyOf: [{ type: 'string' }, { type: 'null' }] }
              },
              required: [
                'city', 'date', 'eventType', 'category', 'budgetKzt',
                'durationHours', 'language', 'wishes'
              ],
              type: 'object'
            },
            strict: true,
            type: 'json_schema'
          }
        }
      });
      if (response.status !== 'completed') return null;
      const parsed = JSON.parse(response.output_text) as StructuredParsedRequest;
      return this.normalizeParsed(parsed, metadata);
    } catch (error) {
      this.logger.warn(`OpenAI request parsing failed; fallback is used: ${this.errorMessage(error)}`);
      return null;
    }
  }

  async explainRecommendations(
    request: RecommendationRequestDto,
    items: RecommendationItemDto[]
  ): Promise<Map<string, string> | null> {
    if (!this.client || items.length === 0) return null;

    try {
      const facts = items.map((item) => ({
        categories: item.categories,
        city: item.city,
        description: item.description.slice(0, 1_200),
        eventFormats: item.eventFormats,
        fallbackExplanation: item.explanation,
        id: item.id,
        languages: item.languages,
        maxHours: item.maxHours,
        name: item.name,
        priceFromKzt: item.priceFromKzt,
        synthetic: item.synthetic
      }));
      const response = await this.client.responses.create({
        max_output_tokens: 1200,
        input: JSON.stringify({ candidates: facts, request }),
        instructions: [
          'Напиши для каждого кандидата невзаимозаменяемое объяснение на русском языке.',
          'Каждое объяснение — 1–2 коротких предложения.',
          'Используй только факты из request и candidates: дата, цена, запас бюджета, формат, язык, длительность и конкретные особенности description.',
          'Не используй общие фразы вроде «идеально подходит» и не выдумывай факты.',
          'Сохрани id каждого кандидата без изменений.'
        ].join(' '),
        model: this.model,
        reasoning: { effort: 'none' },
        text: {
          format: {
            name: 'candidate_explanations',
            schema: {
              additionalProperties: false,
              properties: {
                items: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      explanation: { type: 'string' },
                      id: { type: 'string' }
                    },
                    required: ['id', 'explanation'],
                    type: 'object'
                  },
                  type: 'array'
                }
              },
              required: ['items'],
              type: 'object'
            },
            strict: true,
            type: 'json_schema'
          }
        }
      });
      if (response.status !== 'completed') return null;
      const parsed = JSON.parse(response.output_text) as StructuredExplanations;
      const expectedIds = new Set(items.map((item) => item.id));
      if (!Array.isArray(parsed.items) || parsed.items.length !== items.length) return null;
      const explanations = new Map<string, string>();
      for (const item of parsed.items) {
        if (!item || typeof item.explanation !== 'string' || typeof item.id !== 'string' || explanations.has(item.id)) return null;
        const explanation = item.explanation.trim();
        if (expectedIds.has(item.id) && explanation.length >= 20 && explanation.length <= 700) {
          explanations.set(item.id, explanation);
        }
      }
      return explanations.size === items.length ? explanations : null;
    } catch (error) {
      this.logger.warn(`OpenAI explanation failed; fallback is used: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private normalizeParsed(parsed: StructuredParsedRequest, metadata: CatalogMetadata): AiParsedRequest {
    const findAllowed = (value: string | null, allowed: string[]): string | undefined => {
      if (typeof value !== 'string') return undefined;
      return allowed.find((item) => item.toLocaleLowerCase('ru-RU') === value.trim().toLocaleLowerCase('ru-RU'));
    };
    const validDate = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && isISO8601(parsed.date, { strict: true }) ? parsed.date : undefined;
    const languages = typeof parsed.language === 'string' ? parsed.language.split('|').map((value) => findAllowed(value, metadata.languages)) : [];
    return {
      budgetKzt: Number.isSafeInteger(parsed.budgetKzt) && parsed.budgetKzt! > 0 ? parsed.budgetKzt! : undefined,
      category: findAllowed(parsed.category, metadata.categories),
      city: findAllowed(parsed.city, metadata.cities),
      date: validDate,
      durationHours: Number.isInteger(parsed.durationHours) && parsed.durationHours! > 0 && parsed.durationHours! <= 48 ? parsed.durationHours! : undefined,
      eventType: findAllowed(parsed.eventType, metadata.eventTypes),
      language: languages.length && languages.every(Boolean) ? [...new Set(languages)].join('|') : undefined,
      wishes: typeof parsed.wishes === 'string' ? parsed.wishes.trim().slice(0, 4000) || undefined : undefined
    };
  }

  private errorMessage(error: unknown): string {
    // API errors can echo credentials or submitted data; keep only a safe status.
    return error instanceof OpenAI.APIError && typeof error.status === 'number'
      ? `HTTP ${error.status}`
      : 'request failed';
  }
}
