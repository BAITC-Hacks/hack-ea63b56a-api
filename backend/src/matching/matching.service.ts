import { Injectable } from '@nestjs/common';
import {
  CALENDAR_FROM,
  CALENDAR_TO,
  Contractor,
  hasValue,
  normalize,
  RequestCriteria,
} from '../common/domain';

export interface Exclusions { busy: number; budget: number; format: number; language: number; duration: number }
export interface MatchResult { population: Contractor[]; eligible: Contractor[]; exclusions: Exclusions }
export type MatchField = 'city' | 'category' | 'eventFormat' | 'date' | 'budget' | 'language' | 'duration';
export type DifferenceField = 'date' | 'budget' | 'language' | 'duration';
export interface MatchDifference {
  field: DifferenceField;
  requested: string | number;
  offered: string | number;
  message: string;
}
export interface AlternativeMatch {
  contractor: Contractor;
  availableDate: string;
  matchedFields: MatchField[];
  differences: MatchDifference[];
  penalty: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BUDGET_OVERAGE_RATIO = 0.3;
const MAX_DURATION_SHORTAGE_HOURS = 4;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

@Injectable()
export class MatchingService {
  match(all: Contractor[], request: RequestCriteria): MatchResult {
    const population = all.filter((c) => normalize(c.city) === normalize(request.city) && hasValue(c.categories, request.category));
    const exclusions: Exclusions = { busy: 0, budget: 0, format: 0, language: 0, duration: 0 };
    const eligible = population.filter((c) => {
      const failures = {
        busy: c.busyDates.has(request.date),
        budget: c.priceFromKzt > request.budgetKzt,
        format: !hasValue(c.eventFormats, request.eventFormat),
        language: !!request.language && !hasValue(c.languages, request.language),
        duration: request.durationHours !== undefined && c.maxHours !== null && c.maxHours < request.durationHours,
      };
      for (const reason of Object.keys(failures) as (keyof Exclusions)[])
        if (failures[reason]) exclusions[reason]++;
      return !Object.values(failures).some(Boolean);
    });
    return { population, eligible, exclusions };
  }

  fallbackScore(c: Contractor, request: RequestCriteria): number {
    const description = normalize(c.description);
    const format = normalize(request.eventFormat);
    const category = normalize(request.category);
    return 50 + (description.includes(format) ? 20 : 0) +
      (description.includes(category) ? 10 : 0) +
      Math.max(0, 10 - Math.floor(c.priceFromKzt / Math.max(1, request.budgetKzt) * 10));
  }

  alternatives(all: Contractor[], request: RequestCriteria, excludedIds: Set<string>, limit = 3): AlternativeMatch[] {
    return all
      .filter((c) => !excludedIds.has(c.id))
      .filter((c) => normalize(c.city) === normalize(request.city))
      .filter((c) => hasValue(c.categories, request.category))
      .filter((c) => hasValue(c.eventFormats, request.eventFormat))
      .map((contractor) => this.alternative(contractor, request))
      .filter((candidate): candidate is AlternativeMatch => candidate !== null)
      .sort((a, b) =>
        a.differences.length - b.differences.length ||
        a.penalty - b.penalty ||
        a.contractor.priceFromKzt - b.contractor.priceFromKzt ||
        a.contractor.id.localeCompare(b.contractor.id))
      .slice(0, limit);
  }

  private alternative(contractor: Contractor, request: RequestCriteria): AlternativeMatch | null {
    const matchedFields: MatchField[] = ['city', 'category', 'eventFormat'];
    const differences: MatchDifference[] = [];
    let penalty = 0;

    const availableDate = contractor.busyDates.has(request.date)
      ? this.nearestAvailableDate(contractor, request.date)
      : request.date;
    if (!availableDate) return null;
    if (availableDate === request.date) matchedFields.push('date');
    else {
      const days = Math.abs((Date.parse(`${availableDate}T00:00:00.000Z`) - Date.parse(`${request.date}T00:00:00.000Z`)) / DAY_MS);
      differences.push({
        field: 'date', requested: request.date, offered: availableDate,
        message: `На ${request.date} исполнитель занят, ближайшая свободная дата — ${availableDate}.`,
      });
      penalty += days;
    }

    if (contractor.priceFromKzt <= request.budgetKzt) matchedFields.push('budget');
    else {
      const overage = contractor.priceFromKzt - request.budgetKzt;
      const ratio = overage / request.budgetKzt;
      if (ratio > MAX_BUDGET_OVERAGE_RATIO) return null;
      differences.push({
        field: 'budget', requested: request.budgetKzt, offered: contractor.priceFromKzt,
        message: `Стартовая цена выше бюджета на ${overage} ₸.`,
      });
      penalty += ratio * 100;
    }

    if (request.language) {
      if (hasValue(contractor.languages, request.language)) matchedFields.push('language');
      else {
        differences.push({
          field: 'language', requested: request.language, offered: contractor.languages.join(', '),
          message: `Запрошенный язык «${request.language}» не указан; в профиле: ${contractor.languages.join(', ')}.`,
        });
        penalty += 30;
      }
    }

    if (request.durationHours !== undefined) {
      if (contractor.maxHours === null || contractor.maxHours >= request.durationHours) matchedFields.push('duration');
      else {
        const shortage = request.durationHours - contractor.maxHours;
        if (shortage > MAX_DURATION_SHORTAGE_HOURS) return null;
        differences.push({
          field: 'duration', requested: request.durationHours, offered: contractor.maxHours,
          message: `Профиль рассчитан максимум на ${contractor.maxHours} ч вместо запрошенных ${request.durationHours} ч.`,
        });
        penalty += shortage * 10;
      }
    }

    if (!differences.length) return null;
    return { contractor, availableDate, matchedFields, differences, penalty };
  }

  private nearestAvailableDate(contractor: Contractor, requestedDate: string): string | null {
    const maxDistance = Math.ceil((Date.parse(`${CALENDAR_TO}T00:00:00.000Z`) - Date.parse(`${CALENDAR_FROM}T00:00:00.000Z`)) / DAY_MS);
    for (let distance = 1; distance <= maxDistance; distance++) {
      const later = shiftDate(requestedDate, distance);
      if (later <= CALENDAR_TO && !contractor.busyDates.has(later)) return later;
      const earlier = shiftDate(requestedDate, -distance);
      if (earlier >= CALENDAR_FROM && !contractor.busyDates.has(earlier)) return earlier;
    }
    return null;
  }
}
