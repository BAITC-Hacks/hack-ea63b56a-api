export enum RecommendationStatus {
  MATCHED = 'matched',
  NO_CATEGORY_IN_CITY = 'no_category_in_city',
  NO_CANDIDATES_AFTER_FILTERS = 'no_candidates_after_filters'
}

export interface Contractor {
  id: string;
  name: string;
  categories: string[];
  city: string;
  cityImputed: boolean;
  synthetic: boolean;
  priceFromKzt: number;
  priceImputed: boolean;
  eventFormats: string[];
  languages: string[];
  maxHours: number | null;
  busyDates: string[];
  description: string;
}

export type ExclusionCode =
  | 'busy'
  | 'over_budget'
  | 'event_format'
  | 'duration'
  | 'language';

export interface ScoredContractor {
  contractor: Contractor;
  score: number;
  semanticTerms: string[];
}

export interface ExcludedContractor {
  contractor: Contractor;
  reasons: string[];
  codes: ExclusionCode[];
}
