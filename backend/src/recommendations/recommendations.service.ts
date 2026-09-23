import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService, AiRanking, PROMPT_VERSION } from '../ai/ai.service';
import { CALENDAR_FROM, CALENDAR_TO, Contractor, RequestCriteria, normalize, validIsoDate } from '../common/domain';
import { ContractorsService } from '../contractors/contractors.service';
import { Exclusions, MatchingService } from '../matching/matching.service';
import { ExplainerService } from './explainer.service';
import { RecommendationRequestDto, RecommendationResponseDto, RecommendationStatus } from './recommendation.dto';
import { SnapshotService } from './snapshot.service';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly contractors: ContractorsService,
    private readonly matching: MatchingService,
    private readonly ai: AiService,
    private readonly explainer: ExplainerService,
    private readonly snapshots: SnapshotService,
  ) {}

  async recommend(dto: RecommendationRequestDto): Promise<RecommendationResponseDto> {
    const request = dto.normalized();
    if (!validIsoDate(request.date) || request.date < CALENDAR_FROM || request.date > CALENDAR_TO)
      throw new BadRequestException(`date must be from ${CALENDAR_FROM} through ${CALENDAR_TO}`);
    const key = this.snapshots.key({ request, datasetHash: this.contractors.datasetHash,
      model: this.ai.model, promptVersion: PROMPT_VERSION, pipelineVersion: 'mvp-2', aiEnabled: this.ai.enabled });
    return this.snapshots.getOrCreate(key, () => this.compute(request), (snapshot) => this.validSnapshot(snapshot, request));
  }

  private validSnapshot(snapshot: RecommendationResponseDto, request: RequestCriteria): boolean {
    const { population, eligible } = this.matching.match(this.contractors.contractors, request);
    const expected = !population.length ? RecommendationStatus.NoCategoryInCity :
      !eligible.length ? RecommendationStatus.NoCandidatesAfterFilters : RecommendationStatus.Matched;
    return snapshot.status === expected && snapshot.totalCandidates === population.length &&
      snapshot.eligibleCount === eligible.length && snapshot.count === Math.min(3, eligible.length) &&
      new Set(snapshot.items.map((item) => item.id)).size === snapshot.count && snapshot.items.every((item) => {
        const c = eligible.find((candidate) => candidate.id === item.id);
        return c && item.name === c.name && item.city === c.city && item.priceFromKzt === c.priceFromKzt &&
          item.synthetic === c.synthetic && item.city_imputed === c.city_imputed && item.price_imputed === c.price_imputed &&
          normalize(item.category) === request.category;
      });
  }

  private async compute(request: RequestCriteria): Promise<RecommendationResponseDto> {
    const { population, eligible, exclusions } = this.matching.match(this.contractors.contractors, request);
    if (!population.length) return this.empty(RecommendationStatus.NoCategoryInCity, request, 0, exclusions);
    if (!eligible.length) return this.empty(RecommendationStatus.NoCandidatesAfterFilters, request, population.length, exclusions);

    const analyzed = await this.ai.analyze(request, eligible);
    const ranking = analyzed || eligible.map((c) => ({
      id: c.id, score: this.matching.fallbackScore(c, request), evidence: this.explainer.evidence(c.description, request), reason: '',
    }));
    const scores = new Map(ranking.map((rank) => [rank.id, rank]));
    const sorted = [...eligible].sort((a, b) =>
      (scores.get(b.id)!.score - scores.get(a.id)!.score) ||
      (a.priceFromKzt - b.priceFromKzt) || a.id.localeCompare(b.id));
    const items = sorted.slice(0, 3).map((c) => this.item(c, request, scores.get(c.id)!));
    return {
      status: RecommendationStatus.Matched, count: items.length,
      totalCandidates: population.length, eligibleCount: eligible.length,
      message: this.matchedMessage(request, population.length, eligible.length, items.length, exclusions),
      analysisMode: analyzed ? 'ai' : 'fallback', exclusions, items,
    };
  }

  private item(c: Contractor, request: RequestCriteria, rank: AiRanking) {
    return {
      id: c.id, name: c.name, category: c.categories.find((value) => normalize(value) === normalize(request.category))!,
      city: c.city, priceFromKzt: c.priceFromKzt,
      explanation: this.explainer.explain(c, request, rank.evidence, rank.reason),
      synthetic: c.synthetic, city_imputed: c.city_imputed, price_imputed: c.price_imputed,
    };
  }

  private reason(exclusions: Exclusions): string {
    const reasons = [
      exclusions.busy && `${exclusions.busy} заняты`,
      exclusions.budget && `${exclusions.budget} дороже бюджета`,
      exclusions.format && `${exclusions.format} не работают с форматом`,
      exclusions.language && `${exclusions.language} не поддерживают язык`,
      exclusions.duration && `${exclusions.duration} не подходят по длительности`,
    ].filter(Boolean);
    return reasons.length ? reasons.join('; ') : 'в городе мало профилей этой категории';
  }

  private matchedMessage(request: RequestCriteria, population: number, eligible: number, count: number, exclusions: Exclusions): string {
    if (count < 3) return `На ${request.date} найдено ${count} из 3: всего ${population} в городе и категории, после условий подходят ${eligible}; ${this.reason(exclusions)}.`;
    return `На ${request.date} показаны 3 из ${eligible} подходящих подрядчиков (в городе и категории всего ${population}).`;
  }

  private empty(status: RecommendationStatus, request: RequestCriteria, population: number, exclusions: Exclusions): RecommendationResponseDto {
    return {
      status, count: 0, totalCandidates: population, eligibleCount: 0,
      message: status === RecommendationStatus.NoCategoryInCity
        ? `На ${request.date} в городе «${request.city}» нет подрядчиков категории «${request.category}» (0 из 3).`
        : `На ${request.date} в городе и категории есть ${population}, но условия отсеяли всех (0 из 3): ${this.reason(exclusions)}.`,
      analysisMode: 'not_needed', exclusions, items: [],
    };
  }
}
