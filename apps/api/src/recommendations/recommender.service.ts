import { Injectable } from '@nestjs/common';
import { CsvLoaderService } from './csv-loader.service';
import { RecommendationRequestDto } from './dto/recommendation-request.dto';
import {
  ExcludedItemDto,
  FilterSummaryDto,
  RecommendationItemDto,
  RecommendationResponseDto,
  SuggestionDto
} from './dto/recommendation-response.dto';
import { ExplainerService } from './explainer.service';
import {
  Contractor,
  ExcludedContractor,
  ExclusionCode,
  RecommendationStatus,
  ScoredContractor
} from './recommendation.types';
import { OpenAiService } from './openai.service';

const normalize = (value: string): string => value.trim().toLocaleLowerCase('ru-RU');
const money = new Intl.NumberFormat('ru-RU');
const STOP_WORDS = new Set([
  'без', 'для', 'или', 'как', 'это', 'нам', 'нужен', 'нужна', 'нужно', 'хотим', 'который',
  'которая', 'под', 'при', 'что', 'чтобы', 'очень', 'мероприятие', 'мероприятия'
]);

@Injectable()
export class RecommenderService {
  constructor(
    private readonly loader: CsvLoaderService,
    private readonly explainer: ExplainerService,
    private readonly openAi: OpenAiService
  ) {}

  async recommend(request: RecommendationRequestDto): Promise<RecommendationResponseDto> {
    const cityCandidates = this.loader
      .getAll()
      .filter((item) => normalize(item.city) === normalize(request.city));
    const categoryCandidates = cityCandidates.filter((item) =>
      item.categories.some((category) => normalize(category) === normalize(request.category))
    );

    if (categoryCandidates.length === 0) {
      return {
        ai: { ...this.openAi.getStatus(), feature: 'recommendation_explainer', used: false },
        excluded: [], filterSummary: [], items: [], suggestions: [], totalConsidered: 0,
        message: `В городе ${request.city} нет подрядчиков категории «${request.category}» в текущем каталоге.`,
        status: RecommendationStatus.NO_CATEGORY_IN_CITY
      };
    }

    const eligible: Contractor[] = [];
    const excluded: ExcludedContractor[] = [];
    for (const contractor of categoryCandidates) {
      const exclusion = this.getExclusions(contractor, request);
      if (exclusion.codes.length) excluded.push({ contractor, ...exclusion });
      else eligible.push(contractor);
    }

    const scored = eligible
      .map((contractor) => this.score(contractor, request))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.contractor.priceFromKzt - right.contractor.priceFromKzt ||
          left.contractor.id.localeCompare(right.contractor.id)
    );
    const items = scored.slice(0, 3).map((candidate, index) => this.toItem(candidate, request, index));
    const aiExplanations = await this.openAi.explainRecommendations(request, items);
    if (aiExplanations) {
      for (const item of items) item.explanation = aiExplanations.get(item.id) ?? item.explanation;
    }
    const filterSummary = this.summarize(excluded);
    const suggestions = scored.length ? [] : this.suggest(categoryCandidates, request);

    return {
      ai: {
        ...this.openAi.getStatus(),
        feature: 'recommendation_explainer',
        used: aiExplanations !== null
      },
      excluded: excluded.map((item) => ({
        id: item.contractor.id,
        name: item.contractor.name,
        priceFromKzt: item.contractor.priceFromKzt,
        reasons: item.reasons
      } satisfies ExcludedItemDto)),
      filterSummary,
      items,
      message: items.length
        ? items.length < 3
          ? `Нашли ${items.length} подходящ${items.length === 1 ? 'его' : 'их'} подрядчик${items.length === 1 ? 'а' : 'ов'}: ${excluded.length ? 'остальные не прошли обязательные условия' : 'это все профили этой категории в городе'}.`
          : 'Нашли 3 наиболее подходящих подрядчиков и сравнили их по вашим условиям.'
        : `В городе ${request.city} есть подрядчики категории «${request.category}», но никто не прошёл все выбранные условия.`,
      status: items.length ? RecommendationStatus.MATCHED : RecommendationStatus.NO_CANDIDATES_AFTER_FILTERS,
      suggestions,
      totalConsidered: categoryCandidates.length
    };
  }

  private getExclusions(
    contractor: Contractor,
    request: RecommendationRequestDto
  ): { codes: ExclusionCode[]; reasons: string[] } {
    const codes: ExclusionCode[] = [];
    const reasons: string[] = [];
    if (contractor.busyDates.includes(request.date)) {
      codes.push('busy');
      reasons.push(`занят на дату ${request.date}`);
    }
    if (!contractor.eventFormats.some((format) => normalize(format) === normalize(request.eventType))) {
      codes.push('event_format');
      reasons.push(`не работает с форматом «${request.eventType}»`);
    }
    if (contractor.priceFromKzt > request.budgetKzt) {
      codes.push('over_budget');
      reasons.push(`цена ${money.format(contractor.priceFromKzt)} ₸ выше бюджета ${money.format(request.budgetKzt)} ₸`);
    }
    if (request.durationHours && contractor.maxHours !== null && contractor.maxHours < request.durationHours) {
      codes.push('duration');
      reasons.push(`может работать максимум ${contractor.maxHours} ч. при требуемых ${request.durationHours} ч.`);
    }
    if (request.language && !request.language.split('|').filter(Boolean).every((requested) =>
      contractor.languages.some((language) => normalize(language) === normalize(requested)))) {
      codes.push('language');
      reasons.push(`не поддерживает язык «${request.language}»`);
    }
    return { codes, reasons };
  }

  private score(contractor: Contractor, request: RecommendationRequestDto): ScoredContractor {
    const wishes = request.wishes ?? '';
    const negativePhrases = /(?:^|\s)(?:без|не\s+нужны|не\s+хотим)\s+[^,.!?;]+/giu;
    const negativeTerms = this.terms((wishes.match(negativePhrases) ?? []).join(' '));
    const positiveWishes = wishes.replace(negativePhrases, ' ');
    const queryTerms = this.terms(positiveWishes);
    const descriptionTerms = new Set(this.terms(contractor.description));
    const semanticTerms = queryTerms.filter((term) => descriptionTerms.has(term));
    const affirmativeDescription = contractor.description.replace(negativePhrases, ' ');
    const stems = this.terms(affirmativeDescription).map((term) => this.stem(term));
    const conflicts = negativeTerms.filter((term) => stems.includes(this.stem(term))).length;
    const budgetRatio = 1 - contractor.priceFromKzt / request.budgetKzt;
    const score =
      60 +
      Math.max(0, budgetRatio) * 15 +
      semanticTerms.length * 5 +
      conflicts * -5 +
      (contractor.languages.length > 1 ? 3 : 0) +
      (request.durationHours && contractor.maxHours === null ? 2 : 0);
    return { contractor, score: Math.round(score * 10) / 10, semanticTerms };
  }

  private terms(value: string): string[] {
    return [...new Set(value.toLocaleLowerCase('ru-RU').match(/[а-яёa-z]{4,}/giu) ?? [])]
      .filter((term) => !STOP_WORDS.has(term));
  }

  private stem(value: string): string {
    return value.replace(/(?:иями|ами|ями|ого|ему|ому|ыми|ими|иях|ах|ях|ов|ев|ом|ем|ам|ям|ые|ие|ый|ий|ой|ая|яя|ую|юю|ых|их|а|я|ы|и|у|ю|е|о)$/u, '');
  }

  private toItem(
    candidate: ScoredContractor,
    request: RecommendationRequestDto,
    rank: number
  ): RecommendationItemDto {
    const item = candidate.contractor;
    return {
      categories: item.categories,
      city: item.city,
      cityImputed: item.cityImputed,
      description: item.description,
      eventFormats: item.eventFormats,
      explanation: this.explainer.explain(candidate, request, rank),
      id: item.id,
      languages: item.languages,
      maxHours: item.maxHours,
      name: item.name,
      priceFromKzt: item.priceFromKzt,
      priceImputed: item.priceImputed,
      score: candidate.score,
      synthetic: item.synthetic
    };
  }

  private summarize(excluded: ExcludedContractor[]): FilterSummaryDto[] {
    const labels: Record<ExclusionCode, string> = {
      busy: 'заняты на выбранную дату',
      duration: 'не подходят по длительности',
      event_format: 'не работают с этим форматом',
      language: 'не поддерживают нужный язык',
      over_budget: 'превышают бюджет'
    };
    return (Object.keys(labels) as ExclusionCode[])
      .map((code) => ({
        code,
        count: excluded.filter((item) => item.codes.includes(code)).length,
        label: labels[code]
      }))
      .filter((item) => item.count > 0);
  }

  private suggest(candidates: Contractor[], request: RecommendationRequestDto): SuggestionDto[] {
    const suggestions: SuggestionDto[] = [];
    const count = (patch: Partial<RecommendationRequestDto>): number => candidates.filter((item) =>
      this.getExclusions(item, { ...request, ...patch }).codes.length === 0).length;
    const exceptBudget = candidates.filter((item) => {
      const relaxed = { ...request, budgetKzt: Number.MAX_SAFE_INTEGER };
      return this.getExclusions(item, relaxed).codes.length === 0;
    });
    const minimumBudget = Math.min(...exceptBudget.map((item) => item.priceFromKzt));
    if (Number.isFinite(minimumBudget)) {
      suggestions.push({
        label: `Увеличить бюджет до ${money.format(minimumBudget)} ₸`,
        candidateCount: count({ budgetKzt: minimumBudget }),
        type: 'budget',
        value: minimumBudget
      });
    }
    if (request.durationHours) {
      const possibleHours = candidates
        .filter((item) => this.getExclusions(item, { ...request, durationHours: undefined }).codes.length === 0)
        .filter((item) => item.maxHours !== null)
        .map((item) => item.maxHours as number)
        .filter((hours) => hours < request.durationHours!);
      const bestHours = Math.max(...possibleHours);
      if (Number.isFinite(bestHours)) {
        suggestions.push({ label: `Сократить длительность до ${bestHours} ч.`, type: 'duration', value: bestHours, candidateCount: count({ durationHours: bestHours }) });
      }
    }
    if (request.language && count({ language: undefined }) > 0) {
      suggestions.push({ label: 'Не учитывать язык при подборе', type: 'language', value: '', candidateCount: count({ language: undefined }) });
    }
    // Only propose an alternative date after checking every other original condition.
    const date = new Date(`${request.date}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      for (let offset = 1; offset <= 30; offset += 1) {
        date.setUTCDate(date.getUTCDate() + 1);
        const value = date.toISOString().slice(0, 10);
        const candidateCount = count({ date: value });
        if (candidateCount) {
          suggestions.push({ label: `Выбрать дату ${value}`, type: 'date', value, candidateCount });
          break;
        }
      }
    }
    return suggestions.slice(0, 3);
  }
}
