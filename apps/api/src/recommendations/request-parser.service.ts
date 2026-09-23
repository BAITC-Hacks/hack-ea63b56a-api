import { Injectable } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { CsvLoaderService } from './csv-loader.service';
import { ParsedRequestResponseDto } from './dto/recommendation-response.dto';
import { AiParsedRequest, OpenAiService } from './openai.service';

const MONTHS: Record<string, string> = {
  января: '01', февраля: '02', марта: '03', апреля: '04', мая: '05', июня: '06',
  июля: '07', августа: '08', сентября: '09', октября: '10', ноября: '11', декабря: '12'
};

@Injectable()
export class RequestParserService {
  constructor(
    private readonly loader: CsvLoaderService,
    private readonly openAi: OpenAiService
  ) {}

  async parse(text: string): Promise<ParsedRequestResponseDto> {
    const metadata = this.loader.getMetadata();
    const aiParsed = await this.openAi.extractRequest(text, metadata);
    const parsed = aiParsed ?? this.parseFallback(text, metadata);
    return this.finalize(parsed, aiParsed !== null);
  }

  private parseFallback(text: string, metadata: ReturnType<CsvLoaderService['getMetadata']>): AiParsedRequest {
    const source = text.toLocaleLowerCase('ru-RU');
    const parsed: AiParsedRequest = {};
    parsed.city = this.findLongest(source, metadata.cities);
    parsed.category = this.findLongest(source, metadata.categories);
    parsed.eventType = this.findLongest(source, metadata.eventTypes);
    parsed.language = metadata.languages.filter((language) => this.findLongest(source, [language])).join('|') || undefined;

    const isoDate = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const writtenDate = source.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?/);
    if (isoDate) parsed.date = isoDate[0];
    else if (writtenDate) {
      const day = writtenDate[1]?.padStart(2, '0');
      const month = MONTHS[writtenDate[2] ?? ''];
      parsed.date = `${writtenDate[3] ?? '2026'}-${month}-${day}`;
    }

    const budget = source.match(/(?:бюджет[^\d]{0,15}|до\s+)(\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)(?:\s*(тыс(?:яч[аиу]?)?\.?|млн|миллион[аов]*))?/);
    if (budget?.[1]) {
      const multiplier = budget[2]?.startsWith('тыс') ? 1000 : budget[2] ? 1_000_000 : 1;
      parsed.budgetKzt = Number(budget[1].replace(/\s/g, '').replace(',', '.')) * multiplier;
    }
    const duration = source.match(/(?:на\s+)?(\d{1,2})\s*(?:час|часа|часов|ч\.)/);
    if (duration?.[1]) parsed.durationHours = Number(duration[1]);

    parsed.wishes = text.trim();
    return parsed;
  }

  private finalize(parsed: AiParsedRequest, usedOpenAi: boolean): ParsedRequestResponseDto {
    if (!parsed.date || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) || !isISO8601(parsed.date, { strict: true })) delete parsed.date;
    if (!Number.isSafeInteger(parsed.budgetKzt) || (parsed.budgetKzt ?? 0) < 1) delete parsed.budgetKzt;
    if (!Number.isInteger(parsed.durationHours) || (parsed.durationHours ?? 0) < 1 || (parsed.durationHours ?? 0) > 48) delete parsed.durationHours;
    const required: Array<keyof ParsedRequestResponseDto['parsed']> = [
      'city', 'date', 'eventType', 'category', 'budgetKzt'
    ];
    const missing = required.filter((field) => !parsed[field]);
    const questions: Record<string, string> = {
      budgetKzt: 'Какой максимальный бюджет вы планируете?',
      category: 'Подрядчик какой категории вам нужен?',
      city: 'В каком городе пройдёт мероприятие?',
      date: 'На какую дату запланировано мероприятие?',
      eventType: 'Какой тип мероприятия вы планируете?'
    };
    return {
      missing,
      model: this.openAi.getStatus().model,
      parsed,
      question: missing[0] ? questions[missing[0]] ?? 'Уточните параметры мероприятия.' : null,
      source: usedOpenAi ? 'openai' : 'fallback'
    };
  }

  private findLongest(source: string, values: string[]): string | undefined {
    const aliases: Record<string, string[]> = {
      'астана': ['астане', 'астану', 'астаны'],
      'свадьба': ['свадьбу', 'свадьбе', 'свадьбы'],
      'конференция': ['конференцию', 'конференции'],
      'юбилей': ['юбилея', 'юбилее'],
      'ведущий': ['ведущего', 'ведущая', 'ведущую'],
      'ведущий церемонии': ['ведущего церемонии', 'ведущую церемонии'],
      'русский': ['русском', 'русскоязычный'],
      'казахский': ['казахском', 'казахскоязычный'],
      'английский': ['английском', 'англоязычный']
    };
    return [...values]
      .sort((left, right) => right.length - left.length)
      .find((value) => {
        const normalized = value.toLocaleLowerCase('ru-RU');
        return [normalized, ...(aliases[normalized] ?? [])].some((variant) => {
          const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?:^|[^а-яёa-z])${escaped}(?:$|[^а-яёa-z])`, 'u').test(source);
        }) || (normalized.endsWith('ист') || normalized === 'фотограф' || normalized === 'декоратор')
          && new RegExp(`(?:^|[^а-яёa-z])${normalized}(?:а|у|ом|е)?(?:$|[^а-яёa-z])`, 'u').test(source);
      });
  }
}
