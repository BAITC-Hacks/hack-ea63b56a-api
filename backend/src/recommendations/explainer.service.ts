import { Injectable } from '@nestjs/common';
import { Contractor, RequestCriteria } from '../common/domain';

@Injectable()
export class ExplainerService {
  evidence(description: string, request?: RequestCriteria): string {
    const plain = description.replace(/\s+/g, ' ').trim();
    const fragments = plain.split(/[.!?•]+/u).map((text) => text.trim()).filter((text) =>
      text.length >= 20 && !/приветств|всем привет|меня зовут|с уважением|свяжитесь|дорогие друзья/iu.test(text));
    const keywords = /сценари|импровизац|интерактив|юмор|танц|музык|саксофон|скрипк|репертуар|флорист|композиц|оформлен|фотозон|свет|оборудован|зал|гост|съём|съем|фотограф|фотобудк|печать|welcome|бренд|dj|конференц|форум|опыт|стиль/giu;
    const score = (text: string) => (text.match(keywords)?.length ?? 0) * 3 +
      (request && text.toLowerCase().includes(request.eventFormat.toLowerCase()) ? 6 : 0) +
      (/\d/u.test(text) ? 2 : 0);
    const best = fragments.map((text, index) => ({ text, index, score: score(text) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.text ?? plain;
    const excerpt = best.length <= 180 ? best : best.slice(0, best.lastIndexOf(' ', 180));
    return excerpt.replace(/[.!?\s]+$/u, '').trim();
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
