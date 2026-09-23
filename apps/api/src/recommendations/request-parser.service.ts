import { Injectable } from '@nestjs/common';
import { CsvLoaderService } from './csv-loader.service';
import { ParsedRequestResponseDto } from './dto/recommendation-response.dto';

const MONTHS: Record<string, string> = {
  января: '01', февраля: '02', марта: '03', апреля: '04', мая: '05', июня: '06',
  июля: '07', августа: '08', сентября: '09', октября: '10', ноября: '11', декабря: '12'
};

@Injectable()
export class RequestParserService {
  constructor(private readonly loader: CsvLoaderService) {}

  parse(text: string): ParsedRequestResponseDto {
    const source = text.toLocaleLowerCase('ru-RU');
    const metadata = this.loader.getMetadata();
    const parsed: ParsedRequestResponseDto['parsed'] = {};
    parsed.city = this.findLongest(source, metadata.cities);
    parsed.category = this.findLongest(source, metadata.categories);
    parsed.eventType = this.findLongest(source, metadata.eventTypes);
    parsed.language = this.findLongest(source, metadata.languages);

    const isoDate = source.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const writtenDate = source.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?/);
    if (isoDate) parsed.date = isoDate[0];
    else if (writtenDate) {
      const day = writtenDate[1]?.padStart(2, '0');
      const month = MONTHS[writtenDate[2] ?? ''];
      parsed.date = `${writtenDate[3] ?? '2026'}-${month}-${day}`;
    }

    const budget = source.match(/(?:бюджет[^\d]{0,15}|до\s+)(\d[\d\s]{3,})(?:\s*₸|\s*тенге)?/);
    if (budget?.[1]) parsed.budgetKzt = Number(budget[1].replace(/\s/g, ''));
    const duration = source.match(/(?:на\s+)?(\d{1,2})\s*(?:час|часа|часов|ч\.)/);
    if (duration?.[1]) parsed.durationHours = Number(duration[1]);

    parsed.wishes = text.trim();
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
      parsed,
      question: missing[0] ? questions[missing[0]] ?? 'Уточните параметры мероприятия.' : null
    };
  }

  private findLongest(source: string, values: string[]): string | undefined {
    return [...values]
      .sort((left, right) => right.length - left.length)
      .find((value) => source.includes(value.toLocaleLowerCase('ru-RU')));
  }
}
