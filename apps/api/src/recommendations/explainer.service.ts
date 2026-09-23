import { Injectable } from '@nestjs/common';
import { RecommendationRequestDto } from './dto/recommendation-request.dto';
import { ScoredContractor } from './recommendation.types';

const money = new Intl.NumberFormat('ru-RU');

@Injectable()
export class ExplainerService {
  explain(candidate: ScoredContractor, request: RecommendationRequestDto, rank: number): string {
    const item = candidate.contractor;
    const saving = request.budgetKzt - item.priceFromKzt;
    const availability = `Свободен ${this.formatDate(request.date)}`;
    const duration = request.durationHours
      ? item.maxHours === null
        ? `формат не ограничен присутствием на площадке`
        : `может работать необходимые ${request.durationHours} ч.`
      : null;
    const language = request.language
      ? `языки работы: ${request.language.split('|').join(', ')}`
      : item.languages.length > 1
        ? `работает на языках: ${item.languages.join(', ')}`
        : null;
    const semantic = candidate.semanticTerms.length
      ? `В описании совпали важные акценты: ${candidate.semanticTerms.slice(0, 3).join(', ')}.`
      : this.descriptionFact(item.description);

    if (rank === 0) {
      return `${availability} и укладывается в бюджет с запасом ${money.format(saving)} ₸. ${semantic}`;
    }
    if (rank === 1 && language) {
      return `${availability}, ${language} и стоит от ${money.format(item.priceFromKzt)} ₸. ${semantic}`;
    }
    const conditions = [duration, language].filter(Boolean).join(', ');
    return `${availability}; цена от ${money.format(item.priceFromKzt)} ₸${conditions ? `, ${conditions}` : ''}. ${semantic}`;
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`)
    );
  }

  private descriptionFact(description: string): string {
    const cleaned = description.replace(/\s+/g, ' ').trim();
    const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() ?? '';
    if (!firstSentence) return 'Профиль соответствует выбранному формату мероприятия.';
    return `Профиль выделяется тем, что ${firstSentence.charAt(0).toLowerCase()}${firstSentence.slice(1)}.`;
  }
}
