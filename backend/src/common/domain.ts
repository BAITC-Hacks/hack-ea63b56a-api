export const CALENDAR_FROM = '2026-09-23';
export const CALENDAR_TO = '2026-12-31';

export interface Contractor {
  id: string;
  name: string;
  categories: string[];
  city: string;
  city_imputed: boolean;
  synthetic: boolean;
  priceFromKzt: number;
  price_imputed: boolean;
  eventFormats: string[];
  languages: string[];
  maxHours: number | null;
  busyDates: Set<string>;
  description: string;
}

export interface RequestCriteria {
  city: string;
  date: string;
  eventFormat: string;
  category: string;
  budgetKzt: number;
  language?: string;
  durationHours?: number;
}

export const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
export const hasValue = (values: string[], desired: string): boolean =>
  values.some((value) => normalize(value) === normalize(desired));

export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
