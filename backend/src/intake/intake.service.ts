import { Injectable } from '@nestjs/common';
import { CALENDAR_FROM, CALENDAR_TO, normalize, validIsoDate } from '../common/domain';
import { ContractorsService } from '../contractors/contractors.service';
import { IntakeAiService, IntakeCatalog, IntakeExtraction } from './intake-ai.service';
import { IntakeParseResponseDto, IntakeValuesDto } from './intake.dto';

const REQUIRED_FIELDS: (keyof IntakeValuesDto)[] = ['city', 'date', 'eventFormat', 'category', 'budgetKzt'];

@Injectable()
export class IntakeService {
  constructor(
    private readonly contractors: ContractorsService,
    private readonly ai: IntakeAiService,
  ) {}

  async parse(message: string): Promise<IntakeParseResponseDto> {
    const catalog = this.contractors.catalog();
    const fallback = this.fallback(message, catalog);
    const extracted = await this.ai.parse(message, catalog);
    const assumptions: string[] = [];
    const aiValues = extracted ? this.sanitize(extracted, catalog, assumptions) : {};
    const values = { ...fallback, ...aiValues };
    const missing = REQUIRED_FIELDS.filter((field) => values[field] === undefined);
    const confidence = extracted
      ? this.aiConfidence(extracted.confidence, values, assumptions)
      : this.fallbackConfidence(values);

    if (extracted) assumptions.unshift(...extracted.assumptions.map((item) => item.trim()).filter(Boolean));

    return {
      values,
      assumptions: [...new Set(assumptions)].slice(0, 8),
      missing,
      confidence,
      analysisMode: extracted ? 'ai' : 'fallback',
    };
  }

  private sanitize(
    extracted: IntakeExtraction,
    catalog: IntakeCatalog,
    assumptions: string[],
  ): IntakeValuesDto {
    const values: IntakeValuesDto = {};
    this.catalogValue(extracted.city, catalog.cities, 'city', values, assumptions);
    this.catalogValue(extracted.eventFormat, catalog.eventFormats, 'eventFormat', values, assumptions);
    this.catalogValue(extracted.category, catalog.categories, 'category', values, assumptions);
    this.catalogValue(extracted.language, catalog.languages, 'language', values, assumptions);

    if (extracted.date !== null) {
      if (validIsoDate(extracted.date) && extracted.date >= CALENDAR_FROM && extracted.date <= CALENDAR_TO)
        values.date = extracted.date;
      else assumptions.push('Указанная дата не входит в доступный календарь.');
    }
    if (extracted.budgetKzt !== null && Number.isSafeInteger(extracted.budgetKzt) && extracted.budgetKzt > 0)
      values.budgetKzt = extracted.budgetKzt;
    if (extracted.durationHours !== null && Number.isFinite(extracted.durationHours)
      && extracted.durationHours > 0 && extracted.durationHours <= 24)
      values.durationHours = extracted.durationHours;
    return values;
  }

  private catalogValue<K extends 'city' | 'eventFormat' | 'category' | 'language'>(
    value: string | null,
    allowed: string[],
    field: K,
    target: IntakeValuesDto,
    assumptions: string[],
  ): void {
    if (value === null) return;
    const matched = allowed.find((candidate) => normalize(candidate) === normalize(value));
    if (matched) target[field] = matched;
    else assumptions.push(`Не удалось сопоставить поле ${field} с каталогом.`);
  }

  private fallback(message: string, catalog: IntakeCatalog): IntakeValuesDto {
    const text = normalize(message).replace(/ё/g, 'е');
    const values: IntakeValuesDto = {};
    values.city = this.findCatalogValue(text, catalog.cities, {
      'алматы': /алмат(?:ы|е|у)?/iu,
      'астана': /астан(?:а|е|у)?/iu,
      'зарубежье': /зарубеж/iu,
    });
    values.eventFormat = this.findCatalogValue(text, catalog.eventFormats, {
      'свадьба': /свадьб/iu,
      'корпоратив': /корпоратив/iu,
      'конференция': /конференц/iu,
      'юбилей': /юбиле/iu,
      'день рождения': /(?:день рождения|(?:^|\s)др(?:\s|$))/iu,
      'той': /(?:^|\s)той(?:\s|$)/iu,
    });
    values.language = this.findCatalogValue(text, catalog.languages, {
      'русский': /русск/iu,
      'казахский': /казахск/iu,
      'английский': /английск/iu,
    });
    values.category = this.findCatalogValue(text, [...catalog.categories].sort((a, b) => b.length - a.length));

    const isoDate = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/u)?.[0];
    const localDate = text.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/u);
    const date = isoDate ?? (localDate
      ? `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`
      : undefined);
    if (date && validIsoDate(date) && date >= CALENDAR_FROM && date <= CALENDAR_TO) values.date = date;

    const scaledBudget = text.match(/\b(\d+(?:[.,]\d+)?)\s*(млн|миллион(?:а|ов)?|тыс(?:яч(?:а|и)?)?|к)(?=\s|$)/iu);
    const plainBudget = text.match(/\b(\d[\d\s]{2,})\s*(?:₸|тенге)(?=\s|[.,!?]|$)/iu);
    if (scaledBudget) {
      const amount = Number(scaledBudget[1].replace(',', '.'));
      const scale = /^(?:млн|миллион)/u.test(scaledBudget[2]) ? 1_000_000 : 1_000;
      const budget = Math.round(amount * scale);
      if (Number.isSafeInteger(budget) && budget > 0) values.budgetKzt = budget;
    } else if (plainBudget) {
      const budget = Number(plainBudget[1].replace(/\s/g, ''));
      if (Number.isSafeInteger(budget) && budget > 0) values.budgetKzt = budget;
    }

    const duration = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:ч|час|часа|часов)(?=\s|[.,!?]|$)/iu);
    if (duration) {
      const hours = Number(duration[1].replace(',', '.'));
      if (Number.isFinite(hours) && hours > 0 && hours <= 24) values.durationHours = hours;
    }

    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as IntakeValuesDto;
  }

  private findCatalogValue(text: string, values: string[], aliases: Record<string, RegExp> = {}): string | undefined {
    return values.find((value) => aliases[normalize(value)]?.test(text) || text.includes(normalize(value)));
  }

  private fallbackConfidence(values: IntakeValuesDto): number {
    return Math.min(0.85, Number((0.15 + Object.keys(values).length * 0.1).toFixed(2)));
  }

  private aiConfidence(confidence: number, values: IntakeValuesDto, assumptions: string[]): number {
    const penalty = assumptions.length * 0.1;
    const fieldCount = Object.keys(values).length;
    const coverageLimit = fieldCount === 0 ? 0.1 : 0.35 + fieldCount * 0.09;
    return Number(Math.max(0, Math.min(confidence - penalty, coverageLimit, 1)).toFixed(2));
  }
}
