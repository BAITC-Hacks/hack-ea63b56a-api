import { RecommendationStatus } from '../recommendation.types';

export class RecommendationItemDto {
  id!: string;
  name!: string;
  categories!: string[];
  city!: string;
  cityImputed!: boolean;
  synthetic!: boolean;
  priceFromKzt!: number;
  priceImputed!: boolean;
  eventFormats!: string[];
  languages!: string[];
  maxHours!: number | null;
  description!: string;
  score!: number;
  explanation!: string;
}

export class ExcludedItemDto {
  id!: string;
  name!: string;
  priceFromKzt!: number;
  reasons!: string[];
}

export class FilterSummaryDto {
  code!: string;
  count!: number;
  label!: string;
}

export class SuggestionDto {
  type!: 'budget' | 'duration' | 'language' | 'date';
  candidateCount!: number;
  label!: string;
  value!: number | string;
}

export class AiUsageDto {
  enabled!: boolean;
  used!: boolean;
  model!: string;
  feature!: 'request_parser' | 'recommendation_explainer';
}

export class RecommendationResponseDto {
  status!: RecommendationStatus;
  message!: string;
  totalConsidered!: number;
  items!: RecommendationItemDto[];
  excluded!: ExcludedItemDto[];
  filterSummary!: FilterSummaryDto[];
  suggestions!: SuggestionDto[];
  ai!: AiUsageDto;
}

export class MetadataResponseDto {
  cities!: string[];
  categories!: string[];
  eventTypes!: string[];
  languages!: string[];
  ai!: { enabled: boolean; model: string };
}

export class ParsedRequestResponseDto {
  parsed!: Partial<{
    city: string;
    date: string;
    eventType: string;
    category: string;
    budgetKzt: number;
    durationHours: number;
    language: string;
    wishes: string;
  }>;
  missing!: string[];
  question!: string | null;
  source!: 'openai' | 'fallback';
  model!: string;
}
