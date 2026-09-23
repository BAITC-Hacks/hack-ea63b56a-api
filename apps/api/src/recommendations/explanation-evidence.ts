import { RecommendationRequestDto } from './dto/recommendation-request.dto';

interface ExplanationProfile {
  name: string;
  description: string;
  priceFromKzt: number;
  priceImputed: boolean;
  maxHours: number | null;
  languages: string[];
  eventFormats: string[];
}

const money = new Intl.NumberFormat('ru-RU');
const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
const words = (value: string): string[] => value.toLocaleLowerCase('ru-RU').match(/[а-яёa-z]{4,}/gu) ?? [];
const stem = (value: string): string => value.slice(0, Math.max(4, value.length - 2));
const generic = /привет|добро пожаловать|отличный выбор|идеально|лучши[йх]|меня зовут|здравствуйте|коротко обо мне|на связи|незабываем|воплотим мечт|ваш праздник|вашего мероприятия|сделаем ваш|доверьте|рады приветствовать|созда[её]т атмосферу|праздник.{0,10}особенным|снова почувств|проживани[ея] истори|сверкаем|счастливый человек|осилит|профессионала своего дела|довольные|положительные эмоции/iu;

// The model selects a server-owned excerpt, never generates new factual claims.
export function explanationEvidence(item: ExplanationProfile, request: RecommendationRequestDto, peers: ExplanationProfile[] = []): string[] {
  const wishes = words(request.wishes ?? '').map(stem);
  const nameWords = words(item.name);
  const excerpts = item.description
    .split(/(?<=[.!?])\s+|[•\n]+/u)
    .map((text) => normalize(text).replace(/[.!?]+$/u, '').trim())
    .filter((text) => text.length >= 20 && text.length <= 200 && !generic.test(text))
    .filter((text) => !/счастлив.{0,8}человек|тонким чувством|найти общий язык|удерживаю внимание|энергичная команда|народную любовь|готов выступить на вашем|персональн.{0,20}креативн|^мы\s*[—–-]/iu.test(text))
    .filter((text) => !/https?:|www\.|@|\.[а-яёa-z]|глюкоз|диабет|леч[еи]|гипоаллерген|безопасн.{0,15}здоров/iu.test(text))
    .filter((text) => !nameWords.some((word) => words(text).includes(word)))
    .map((text, index) => ({
      text,
      index,
      score: words(text).filter((word) => wishes.includes(stem(word))).length * 4
        + (/\d|язык|сезонн|привозн|позирован|фотожурнал|репортаж|импровизац|интерактив|документаль/iu.test(text) ? 4 : 0)
        + (/репертуар|позирован|композиц|сезонн|казахском|английском|скрипк|саксофон|печат|сенсорн|сценари|ретро|квартет|постановоч|портрет|не про позы/iu.test(text) ? 5 : 0)
        + (/стиль|съем|съём|импровизац|репортаж|документаль|интерактив|оформлен|флорист|акуст|живой|вокал|опыт|лет|час|гостей|свет|звук|авторск|декор|монтаж|портрет/iu.test(text) ? 3 : 0)
        - (text.length > 160 ? 1 : 0)
        - peers.filter((peer) => peer !== item && normalize(peer.description).includes(text)).length * 20
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ text }) => text);
  const unique = excerpts.filter((text) => !peers.some((peer) => peer !== item && normalize(peer.description).includes(text)));
  return [...new Set(unique.length ? unique : excerpts)].slice(0, 4);
}

export function renderExplanation(item: ExplanationProfile, request: RecommendationRequestDto, evidence?: string): string {
  const price = `${item.priceImputed ? 'Ориентировочная начальная' : 'Начальная'} цена ${money.format(item.priceFromKzt)} ₸`;
  const budget = item.priceFromKzt === request.budgetKzt
    ? `равна бюджету ${money.format(request.budgetKzt)} ₸`
    : `ниже бюджета ${money.format(request.budgetKzt)} ₸`;
  const duration = request.durationHours && item.maxHours !== null
    ? `; лимит ${item.maxHours} ч — вам нужно ${request.durationHours}` : '';
  const first = `${price} ${budget}${duration}.`;
  if (evidence) return `${first} В описании: «${evidence}».`;
  const details = [`В профиле: формат «${request.eventType}»`, `языки: ${item.languages.join(', ')}`,
    item.maxHours === null ? 'услуга не привязана к часам присутствия' : `до ${item.maxHours} ч`,
    'особенности услуги стоит уточнить'];
  return `${first} ${details.join('; ')}.`;
}
