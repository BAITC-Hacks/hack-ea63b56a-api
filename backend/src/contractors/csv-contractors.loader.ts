import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
export class CsvContractorsLoader {
  load(source: Buffer): { contractors: Contractor[]; datasetHash: string } {
    const datasetHash = createHash('sha256').update(source).digest('hex');
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
    const contractors = records.map((row, index) => {
      const line = index + 2;
      if (Object.keys(row).length !== HEADERS.length) throw new Error(`CSV row ${line}: wrong columns`);
      for (const field of ['id', 'anon_name', 'city', 'description'])
        if (!row[field]?.trim()) throw new Error(`CSV row ${line}: empty ${field}`);
      const id = row.id.trim();
      if (ids.has(id)) throw new Error(`CSV row ${line}: duplicate id`);
      ids.add(id);
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
    if (contractors.length === 0) throw new Error('CSV: empty dataset');
    return { contractors, datasetHash };
  }
}
