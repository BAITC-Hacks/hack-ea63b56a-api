import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { CALENDAR_FROM, CALENDAR_TO, Contractor, normalize, validIsoDate } from '../common/domain';

const HEADERS = [
  'id', 'anon_name', 'categories', 'city', 'city_imputed', 'synthetic',
  'price_from_kzt', 'price_imputed', 'event_formats', 'languages',
  'max_hours', 'busy_dates', 'description',
];

type CsvRow = Record<string, string>;

function list(value: string, field: string, line: number, allowEmpty = false): string[] {
  if (!value && allowEmpty) return [];
  const parts = value.split('|').map((part) => part.trim());
  if (parts.some((part) => !part) || !parts.length) throw new Error(`CSV row ${line}: invalid ${field}`);
  if (new Set(parts.map(normalize)).size !== parts.length) throw new Error(`CSV row ${line}: duplicate ${field}`);
  return parts;
}

function bool(value: string, field: string, line: number): boolean {
  if (value === 'True') return true;
  if (value === 'False') return false;
  throw new Error(`CSV row ${line}: invalid ${field}`);
}

function positiveInt(value: string, field: string, line: number): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`CSV row ${line}: invalid ${field}`);
  return parsed;
}

@Injectable()
export class ContractorsService {
  readonly contractors: Contractor[];
  readonly datasetHash: string;

  constructor() {
    const path = resolve(process.env.DATASET_PATH || '../hackathon dataset anonymized.csv');
    const source = readFileSync(path);
    this.datasetHash = createHash('sha256').update(source).digest('hex');
    const records = parse(source, {
      bom: true, columns: (headers: string[]) => {
        if (headers.length !== HEADERS.length || headers.some((header, i) => header !== HEADERS[i]))
          throw new Error('CSV: unexpected headers');
        return headers;
      },
      skip_empty_lines: true,
      relax_quotes: false,
    }) as CsvRow[];
    const ids = new Set<string>();
    this.contractors = records.map((row, index) => {
      const line = index + 2;
      if (Object.keys(row).length !== HEADERS.length) throw new Error(`CSV row ${line}: wrong columns`);
      for (const field of ['id', 'anon_name', 'city', 'description'])
        if (!row[field]?.trim()) throw new Error(`CSV row ${line}: empty ${field}`);
      if (ids.has(row.id)) throw new Error(`CSV row ${line}: duplicate id`);
      ids.add(row.id);
      const dates = list(row.busy_dates, 'busy_dates', line, true);
      for (const date of dates)
        if (!validIsoDate(date) || date < CALENDAR_FROM || date > CALENDAR_TO)
          throw new Error(`CSV row ${line}: invalid busy date`);
      return {
        id: row.id.trim(), name: row.anon_name.trim(),
        categories: list(row.categories, 'categories', line), city: row.city.trim(),
        city_imputed: bool(row.city_imputed, 'city_imputed', line),
        synthetic: bool(row.synthetic, 'synthetic', line),
        priceFromKzt: positiveInt(row.price_from_kzt, 'price_from_kzt', line),
        price_imputed: bool(row.price_imputed, 'price_imputed', line),
        eventFormats: list(row.event_formats, 'event_formats', line),
        languages: list(row.languages, 'languages', line),
        maxHours: row.max_hours === '' ? null : positiveInt(row.max_hours, 'max_hours', line),
        busyDates: new Set(dates), description: row.description.trim(),
      };
    });
    if (this.contractors.length === 0) throw new Error('CSV: empty dataset');
  }

  catalog(): { cities: string[]; categories: string[]; eventFormats: string[]; languages: string[]; calendar: { from: string; to: string } } {
    const unique = (get: (contractor: Contractor) => string[]) =>
      [...new Map(this.contractors.flatMap(get).map((value) => [normalize(value), value])).values()]
        .sort((a, b) => a.localeCompare(b, 'ru'));
    return {
      cities: unique((c) => [c.city]), categories: unique((c) => c.categories),
      eventFormats: unique((c) => c.eventFormats), languages: unique((c) => c.languages),
      calendar: { from: CALENDAR_FROM, to: CALENDAR_TO },
    };
  }
}
