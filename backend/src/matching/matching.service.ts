import { Injectable } from '@nestjs/common';
import { Contractor, hasValue, normalize, RequestCriteria } from '../common/domain';

export interface Exclusions { busy: number; budget: number; format: number; language: number; duration: number }
export interface MatchResult { population: Contractor[]; eligible: Contractor[]; exclusions: Exclusions }

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
}
