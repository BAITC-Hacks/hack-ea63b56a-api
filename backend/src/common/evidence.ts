export function extractEvidence(description: string, eventFormat?: string): string {
  const plain = description.replace(/\s+/g, ' ').trim();
  const fragments = plain.split(/[.!?•]+/u).map((text) => text.trim()).filter((text) =>
    text.length >= 20 && !/приветств|всем привет|меня зовут|с уважением|свяжитесь|дорогие друзья/iu.test(text));
  const keywords = /сценари|импровизац|интерактив|юмор|танц|музык|саксофон|скрипк|репертуар|флорист|композиц|оформлен|фотозон|свет|оборудован|зал|гост|съём|съем|фотограф|фотобудк|печать|welcome|бренд|dj|конференц|форум|опыт|стиль/giu;
  const score = (text: string) => (text.match(keywords)?.length ?? 0) * 3 +
    (eventFormat && text.toLowerCase().includes(eventFormat.toLowerCase()) ? 6 : 0) +
    (/\d/u.test(text) ? 2 : 0);
  const best = fragments.map((text, index) => ({ text, index, score: score(text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.text ?? plain;
  const excerpt = best.length <= 180 ? best : best.slice(0, best.lastIndexOf(' ', 180));
  return excerpt.replace(/[.!?\s]+$/u, '').trim();
}
