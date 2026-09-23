import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService, AiRanking, PROMPT_VERSION } from '../ai/ai.service';
import { CALENDAR_FROM, CALENDAR_TO, Contractor, RequestCriteria, normalize, validIsoDate } from '../common/domain';
import { ContractorsService } from '../contractors/contractors.service';
import { AlternativeMatch, Exclusions, MatchField, MatchingService } from '../matching/matching.service';
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
    if (dto.eventType !== undefined && dto.eventFormat !== undefined && normalize(dto.eventType) !== normalize(dto.eventFormat))
      throw new BadRequestException('eventType and eventFormat must describe the same event');
    const request = dto.normalized();
    if (!validIsoDate(request.date) || request.date < CALENDAR_FROM || request.date > CALENDAR_TO)
      throw new BadRequestException(`date must be from ${CALENDAR_FROM} through ${CALENDAR_TO}`);
    const key = this.snapshots.key({ request, datasetHash: this.contractors.datasetHash,
      model: this.ai.model, promptVersion: PROMPT_VERSION, pipelineVersion: 'mvp-6-criteria-table', aiEnabled: this.ai.enabled });
    return this.snapshots.getOrCreate(key, () => this.compute(request), (snapshot) => this.validSnapshot(snapshot, request));
  }

  private validSnapshot(snapshot: RecommendationResponseDto, request: RequestCriteria): boolean {
    const { population, eligible } = this.matching.match(this.contractors.contractors, request);
    const status = !population.length ? RecommendationStatus.NoCategoryInCity :
      !eligible.length ? RecommendationStatus.NoCandidatesAfterFilters : RecommendationStatus.Matched;
    const exactCount = Math.min(3, eligible.length);
    const alternatives = this.matching.alternatives(
      this.contractors.contractors,
      request,
      new Set(eligible.map((candidate) => candidate.id)),
      3 - exactCount,
    );
    const alternativeById = new Map(alternatives.map((candidate) => [candidate.contractor.id, candidate]));
    const expectedCount = exactCount + alternatives.length;

    return snapshot.status === status && snapshot.totalCandidates === population.length &&
      snapshot.eligibleCount === eligible.length && snapshot.exactCount === exactCount &&
      snapshot.alternativeCount === alternatives.length && snapshot.count === expectedCount &&
      snapshot.items.length === expectedCount && new Set(snapshot.items.map((item) => item.id)).size === expectedCount &&
      snapshot.items.every((item, index) => {
        const exact = eligible.find((candidate) => candidate.id === item.id);
        const alternative = alternativeById.get(item.id);
        const candidate = exact ?? alternative?.contractor;
        if (!candidate || item.name !== candidate.name || item.city !== candidate.city ||
          item.priceFromKzt !== candidate.priceFromKzt || item.synthetic !== candidate.synthetic ||
          item.city_imputed !== candidate.city_imputed || item.price_imputed !== candidate.price_imputed ||
          normalize(item.category) !== request.category) return false;
        if (index < exactCount)
          return !!exact && item.matchType === 'exact' && !item.alternative && item.availableDate === request.date &&
            item.differences.length === 0 &&
            JSON.stringify(item.criteria) === JSON.stringify(this.criteria(candidate, request, request.date, []));
        return !!alternative && item.matchType === 'alternative' && item.alternative &&
          item.availableDate === alternative.availableDate &&
          JSON.stringify(item.differences) === JSON.stringify(alternative.differences) &&
          JSON.stringify(item.criteria) === JSON.stringify(this.criteria(
            candidate, request, alternative.availableDate, alternative.differences,
          ));
      });
  }

  private async compute(request: RequestCriteria): Promise<RecommendationResponseDto> {
    const { population, eligible, exclusions } = this.matching.match(this.contractors.contractors, request);
    const status = !population.length ? RecommendationStatus.NoCategoryInCity :
      !eligible.length ? RecommendationStatus.NoCandidatesAfterFilters : RecommendationStatus.Matched;

    const analyzed = eligible.length ? await this.ai.analyze(request, eligible) : null;
    const ranking = analyzed ?? eligible.map((candidate) => ({
      id: candidate.id,
      score: this.matching.fallbackScore(candidate, request),
      evidence: this.explainer.evidence(candidate.description, request),
      reason: '',
    }));
    const scores = new Map(ranking.map((rank) => [rank.id, rank]));
    const exactContractors = [...eligible].sort((a, b) =>
      (scores.get(b.id)!.score - scores.get(a.id)!.score) ||
      (a.priceFromKzt - b.priceFromKzt) || a.id.localeCompare(b.id)).slice(0, 3);
    const exactItems = exactContractors.map((contractor) =>
      this.exactItem(contractor, request, scores.get(contractor.id)!));

    const alternatives = this.matching.alternatives(
      this.contractors.contractors,
      request,
      new Set(eligible.map((candidate) => candidate.id)),
      3 - exactItems.length,
    );
    const alternativeItems = alternatives.map((alternative) => this.alternativeItem(alternative, request));
    const items = [...exactItems, ...alternativeItems];

    return {
      status,
      count: items.length,
      exactCount: exactItems.length,
      alternativeCount: alternativeItems.length,
      totalCandidates: population.length,
      eligibleCount: eligible.length,
      message: this.message(status, request, population.length, exactItems.length, alternativeItems.length, exclusions),
      analysisMode: analyzed ? 'ai' : items.length ? 'fallback' : 'not_needed',
      exclusions,
      items,
    };
  }

  private exactItem(contractor: Contractor, request: RequestCriteria, rank: AiRanking) {
    const matchedFields: MatchField[] = ['city', 'category', 'eventFormat', 'date', 'budget'];
    if (request.language) matchedFields.push('language');
    if (request.durationHours !== undefined) matchedFields.push('duration');
    return this.item(contractor, request, rank, 'exact', request.date, matchedFields, []);
  }

  private alternativeItem(alternative: AlternativeMatch, request: RequestCriteria) {
    const rank: AiRanking = {
      id: alternative.contractor.id,
      score: this.matching.fallbackScore(alternative.contractor, request),
      evidence: this.explainer.evidence(alternative.contractor.description, request),
      reason: '',
    };
    return this.item(
      alternative.contractor,
      request,
      rank,
      'alternative',
      alternative.availableDate,
      alternative.matchedFields,
      alternative.differences,
    );
  }

  private item(
    contractor: Contractor,
    request: RequestCriteria,
    rank: AiRanking,
    matchType: 'exact' | 'alternative',
    availableDate: string,
    matchedFields: MatchField[],
    differences: AlternativeMatch['differences'],
  ) {
    return {
      id: contractor.id,
      name: contractor.name,
      category: contractor.categories.find((value) => normalize(value) === normalize(request.category))!,
      city: contractor.city,
      priceFromKzt: contractor.priceFromKzt,
      explanation: this.explainer.explain(contractor, request, rank.evidence, rank.reason, {
        matchType, availableDate, differences,
      }),
      synthetic: contractor.synthetic,
      city_imputed: contractor.city_imputed,
      price_imputed: contractor.price_imputed,
      matchType,
      alternative: matchType === 'alternative',
      availableDate,
      matchedFields,
      differences,
      criteria: this.criteria(contractor, request, availableDate, differences),
    };
  }

  private criteria(
    contractor: Contractor,
    request: RequestCriteria,
    availableDate: string,
    differences: AlternativeMatch['differences'],
  ) {
    const differs = (field: AlternativeMatch['differences'][number]['field']) =>
      differences.some((difference) => difference.field === field);
    const comparison: Array<{
      key: MatchField;
      label: string;
      requested: string;
      offered: string;
      status: 'matched' | 'different';
    }> = [
      {
        key: 'category', label: 'Категория', requested: this.label(request.category),
        offered: contractor.categories.join(', '), status: 'matched',
      },
      {
        key: 'eventFormat', label: 'Формат события', requested: request.eventFormat,
        offered: contractor.eventFormats.join(', '), status: 'matched',
      },
      {
        key: 'city', label: 'Город', requested: this.label(request.city),
        offered: contractor.city, status: 'matched',
      },
      {
        key: 'date', label: 'Дата', requested: this.date(request.date),
        offered: `Свободен ${this.date(availableDate)}`, status: differs('date') ? 'different' : 'matched',
      },
      {
        key: 'budget', label: 'Бюджет', requested: `до ${this.money(request.budgetKzt)} ₸`,
        offered: `от ${this.money(contractor.priceFromKzt)} ₸`, status: differs('budget') ? 'different' : 'matched',
      },
    ];
    if (request.language) comparison.push({
      key: 'language', label: 'Язык', requested: request.language,
      offered: contractor.languages.join(', '), status: differs('language') ? 'different' : 'matched',
    });
    if (request.durationHours !== undefined) comparison.push({
      key: 'duration', label: 'Длительность', requested: `${request.durationHours} ч`,
      offered: contractor.maxHours === null ? 'Без ограничения по часам' : `до ${contractor.maxHours} ч`,
      status: differs('duration') ? 'different' : 'matched',
    });
    return comparison;
  }

  private message(
    status: RecommendationStatus,
    request: RequestCriteria,
    population: number,
    exactCount: number,
    alternativeCount: number,
    exclusions: Exclusions,
  ): string {
    const date = this.date(request.date);
    if (status === RecommendationStatus.NoCategoryInCity)
      return `В городе «${this.label(request.city)}» в каталоге пока нет исполнителей категории «${this.label(request.category)}». Мы не стали подменять нужную услугу другой; следующий шаг — проверить эту категорию в соседнем городе или вернуться к поиску позже.`;
    if (exactCount >= 3)
      return `Для вашего формата «${request.eventFormat}» нашли три точных варианта на ${date}: они свободны, укладываются в бюджет и соответствуют указанным условиям.`;

    const shortage = this.shortageReason(exclusions, population);
    if (exactCount > 0 && alternativeCount > 0)
      return `На ${date} нашли ${exactCount} ${this.word(exactCount, 'точный вариант', 'точных варианта', 'точных вариантов')} без компромиссов. Чтобы выбор не ограничивался ${exactCount} из 3, добавили ${alternativeCount} ${this.word(alternativeCount, 'близкую альтернативу', 'близкие альтернативы', 'близких альтернатив')}; в карточках честно отмечено, что именно нужно изменить. ${shortage}`;
    if (exactCount > 0)
      return `На ${date} нашлось только ${exactCount} из 3 точных вариантов для формата «${request.eventFormat}». Мы не стали заполнять выдачу неподходящими профилями. ${shortage} ${this.nextStep(exclusions)}`;
    if (alternativeCount > 0)
      return `На ${date} точного совпадения нет, но мы нашли ${alternativeCount} ${this.word(alternativeCount, 'близкий вариант', 'близких варианта', 'близких вариантов')} для того же формата «${request.eventFormat}». Город, категория и смысл события сохранены, а необходимый компромисс явно указан в каждой карточке. ${shortage}`;
    return `На ${date} точных вариантов для формата «${request.eventFormat}» не осталось. Мы не стали предлагать другой тип события или скрывать несовпадения. ${shortage} ${this.nextStep(exclusions)}`;
  }

  private shortageReason(exclusions: Exclusions, population: number): string {
    const reasons = [
      exclusions.busy && `${exclusions.busy} заняты на эту дату`,
      exclusions.budget && `${exclusions.budget} начинают работу дороже вашего бюджета`,
      exclusions.format && `${exclusions.format} не работают с этим форматом события`,
      exclusions.language && `${exclusions.language} не указали нужный язык`,
      exclusions.duration && `${exclusions.duration} не готовы работать столько часов`,
    ].filter((reason): reason is string => typeof reason === 'string');
    return reasons.length
      ? `Из ${population} профилей выбор сузился потому, что ${reasons.join('; ')}.`
      : `В каталоге этого города сейчас только ${population} ${this.word(population, 'профиль', 'профиля', 'профилей')} нужной категории.`;
  }

  private nextStep(exclusions: Exclusions): string {
    const [greatest, count] = Object.entries(exclusions).sort((a, b) => b[1] - a[1])[0] as [keyof Exclusions, number];
    if (!count) return 'Если нужен более широкий выбор, проверьте ту же категорию в соседнем городе.';
    if (greatest === 'busy') return 'Самый полезный следующий шаг — проверить соседнюю дату.';
    if (greatest === 'budget') return 'Самый полезный следующий шаг — немного увеличить бюджет.';
    if (greatest === 'language') return 'Попробуйте убрать языковое ограничение, если перевод можно организовать отдельно.';
    if (greatest === 'duration') return 'Попробуйте сократить время присутствия исполнителя.';
    return 'Попробуйте соседнюю дату или уточните формат события.';
  }

  private date(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${value}T00:00:00.000Z`));
  }

  private money(value: number): string {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  private word(count: number, one: string, few: string, many: string): string {
    const tens = count % 100;
    const units = count % 10;
    if (tens >= 11 && tens <= 14) return many;
    if (units === 1) return one;
    if (units >= 2 && units <= 4) return few;
    return many;
  }

  private label(value: string): string {
    return value ? value[0].toLocaleUpperCase('ru') + value.slice(1) : value;
  }
}
