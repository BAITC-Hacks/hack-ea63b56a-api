import { Injectable } from '@nestjs/common';
import { Contractor, RequestCriteria } from '../common/domain';
import { extractEvidence } from '../common/evidence';

@Injectable()
export class ExplainerService {
  evidence(description: string, request?: RequestCriteria): string {
    return extractEvidence(description, request?.eventFormat);
  }

  explain(c: Contractor, request: RequestCriteria, evidence: string, reason?: string): string {
    const budget = new Intl.NumberFormat('ru-RU').format(c.priceFromKzt);
    const language = request.language ? `, язык «${request.language}»` : '';
    const duration = request.durationHours === undefined ? '' : c.maxHours === null
      ? ', работа не привязана к присутствию на площадке'
      : `, длительность ${request.durationHours} ч укладывается в лимит ${c.maxHours} ч`;
    const cleanEvidence = evidence.replace(/\s+/g, ' ').replace(/[.!?\s]+$/u, '').trim();
    const semantic = reason ? `${reason.trim()}: «${cleanEvidence}»` : `В описании: «${cleanEvidence}»`;
    return `На ${request.date} свободен: формат «${request.eventFormat}»${language}${duration}, цена от ${budget} ₸ в пределах бюджета ${new Intl.NumberFormat('ru-RU').format(request.budgetKzt)} ₸. ${semantic}.`;
  }
}
