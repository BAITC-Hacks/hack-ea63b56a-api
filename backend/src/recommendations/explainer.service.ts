import { Injectable } from '@nestjs/common';
import { Contractor, RequestCriteria } from '../common/domain';
import { extractEvidence } from '../common/evidence';
import { MatchDifference } from '../matching/matching.service';

export interface ExplanationContext {
  matchType: 'exact' | 'alternative';
  availableDate: string;
  differences: MatchDifference[];
}

@Injectable()
export class ExplainerService {
  evidence(description: string, request?: RequestCriteria): string {
    return extractEvidence(description, request?.eventFormat);
  }

  explain(
    c: Contractor,
    request: RequestCriteria,
    evidence: string,
    reason = '',
    context: ExplanationContext = { matchType: 'exact', availableDate: request.date, differences: [] },
  ): string {
    const price = this.money(c.priceFromKzt);
    const budget = this.money(request.budgetKzt);
    const date = this.date(context.availableDate);
    const category = c.categories.find((value) => value.toLocaleLowerCase('ru') === request.category.toLocaleLowerCase('ru'))
      ?? request.category;
    const differs = (field: MatchDifference['field']) => context.differences.some((difference) => difference.field === field);
    const fits = [`работает в категории «${category}» и с форматом «${request.eventFormat}» в ${c.city}`];
    if (!differs('date')) fits.push(`свободен ${date}`);
    if (!differs('budget')) fits.push(`стартовая цена ${price} ₸ укладывается в бюджет ${budget} ₸`);
    if (request.language && c.languages.some((language) => language.toLocaleLowerCase('ru') === request.language!.toLocaleLowerCase('ru')))
      fits.push(`поддерживает ${request.language} язык`);
    if (request.durationHours !== undefined && (c.maxHours === null || c.maxHours >= request.durationHours))
      fits.push(c.maxHours === null ? 'услуга не привязана к часам присутствия' : `может работать нужные ${request.durationHours} ч`);

    const compromises = context.differences.map((difference) =>
      difference.message.replace(/[.!?\s]+$/u, '').trim().replace(/^На /u, 'на '));
    const lead = context.matchType === 'exact'
      ? `«${c.name}» подходит именно под ваш запрос: ${fits.join(', ')}.`
      : `«${c.name}» сохраняет главное для вашего запроса: ${fits.join(', ')}; компромисс — ${compromises.join('; ')}.`;
    const cleanEvidence = evidence.replace(/\s+/g, ' ').replace(/[.!?\s]+$/u, '').trim();
    const cleanReason = reason.replace(/\s+/g, ' ').replace(/[.!?\s]+$/u, '').trim();
    const semantic = cleanReason
      ? `${this.capitalize(cleanReason)}; это подтверждает описание профиля: «${cleanEvidence}».`
      : `По содержанию профиля он релевантен вашему формату: «${cleanEvidence}».`;
    return `${lead} ${semantic}`;
  }

  private money(value: number): string {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  private date(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${value}T00:00:00.000Z`));
  }

  private capitalize(value: string): string {
    return value ? value[0].toLocaleUpperCase('ru') + value.slice(1) : value;
  }
}
