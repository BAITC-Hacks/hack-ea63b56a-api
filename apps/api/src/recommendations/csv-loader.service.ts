import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Contractor } from './recommendation.types';

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function splitList(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

@Injectable()
export class CsvLoaderService implements OnModuleInit {
  private contractors: Contractor[] = [];

  onModuleInit(): void {
    this.contractors = this.load();
  }

  getAll(): readonly Contractor[] {
    if (this.contractors.length === 0) this.contractors = this.load();
    return this.contractors;
  }

  getMetadata(): {
    cities: string[];
    categories: string[];
    eventTypes: string[];
    languages: string[];
  } {
    const contractors = this.getAll();
    return {
      categories: [...new Set(contractors.flatMap((item) => item.categories))].sort(),
      cities: [...new Set(contractors.map((item) => item.city))].sort(),
      eventTypes: [...new Set(contractors.flatMap((item) => item.eventFormats))].sort(),
      languages: [...new Set(contractors.flatMap((item) => item.languages))].sort()
    };
  }

  private load(): Contractor[] {
    const configured = process.env.DATASET_PATH;
    const candidates = [
      configured,
      resolve(process.cwd(), 'data/contractors.csv'),
      resolve(process.cwd(), '../../data/contractors.csv')
    ].filter((path): path is string => Boolean(path));
    let content: string | undefined;
    for (const path of candidates) {
      try {
        content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
        break;
      } catch {
        // Try the next location; workspaces use a different cwd in some runners.
      }
    }
    if (!content) throw new Error('Dataset data/contractors.csv was not found');

    const [headers, ...rows] = parseCsv(content);
    if (!headers) throw new Error('Dataset has no header');
    const column = Object.fromEntries(headers.map((name, index) => [name, index]));
    const get = (row: string[], name: string): string => row[column[name] ?? -1] ?? '';

    return rows.map((row) => ({
      busyDates: splitList(get(row, 'busy_dates')),
      categories: splitList(get(row, 'categories')),
      city: get(row, 'city'),
      cityImputed: get(row, 'city_imputed').toLowerCase() === 'true',
      description: get(row, 'description'),
      eventFormats: splitList(get(row, 'event_formats')),
      id: get(row, 'id'),
      languages: splitList(get(row, 'languages')),
      maxHours: get(row, 'max_hours') ? Number(get(row, 'max_hours')) : null,
      name: get(row, 'anon_name'),
      priceFromKzt: Number(get(row, 'price_from_kzt')),
      priceImputed: get(row, 'price_imputed').toLowerCase() === 'true',
      synthetic: get(row, 'synthetic').toLowerCase() === 'true'
    }));
  }
}
