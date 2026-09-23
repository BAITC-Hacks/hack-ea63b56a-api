'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SearchForm {
  city: string;
  date: string;
  eventType: string;
  category: string;
  budgetKzt: string;
  durationHours: string;
  language: string;
  wishes: string;
}

interface Metadata {
  cities: string[];
  categories: string[];
  eventTypes: string[];
  languages: string[];
}

interface RecommendationItem {
  id: string;
  name: string;
  categories: string[];
  city: string;
  cityImputed: boolean;
  synthetic: boolean;
  priceFromKzt: number;
  priceImputed: boolean;
  eventFormats: string[];
  languages: string[];
  maxHours: number | null;
  description: string;
  score: number;
  explanation: string;
}

interface RecommendationResponse {
  status: 'matched' | 'no_category_in_city' | 'no_candidates_after_filters';
  message: string;
  totalConsidered: number;
  items: RecommendationItem[];
  excluded: Array<{ id: string; name: string; priceFromKzt: number; reasons: string[] }>;
  filterSummary: Array<{ code: string; count: number; label: string }>;
  suggestions: Array<{ type: 'budget' | 'duration' | 'language'; label: string; value: number | string }>;
}

interface ParseResponse {
  parsed: Partial<{
    city: string;
    date: string;
    eventType: string;
    category: string;
    budgetKzt: number;
    durationHours: number;
    language: string;
    wishes: string;
  }>;
  missing: string[];
  question: string | null;
}

const FALLBACK_METADATA: Metadata = {
  categories: ['Ведущий', 'Фотограф', 'Флорист', 'Декоратор', 'Банкетный зал'],
  cities: ['Алматы', 'Астана', 'Зарубежье'],
  eventTypes: ['свадьба', 'той', 'корпоратив', 'конференция', 'юбилей', 'день рождения'],
  languages: ['русский', 'казахский', 'английский']
};

const INITIAL_FORM: SearchForm = {
  budgetKzt: '', category: '', city: '', date: '', durationHours: '',
  eventType: '', language: '', wishes: ''
};

const money = new Intl.NumberFormat('ru-RU');

function ArrowIcon(): React.ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11M11 5l5 5-5 5" /></svg>;
}

function SparkIcon(): React.ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></svg>;
}

export default function Home(): React.ReactElement {
  const [metadata, setMetadata] = useState<Metadata>(FALLBACK_METADATA);
  const [form, setForm] = useState<SearchForm>(INITIAL_FORM);
  const [prompt, setPrompt] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetch(`${API_URL}/recommendations/metadata`)
      .then((response) => response.ok ? response.json() as Promise<Metadata> : Promise.reject())
      .then(setMetadata)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setLoadingStep((step) => (step + 1) % 3), 700);
    return () => window.clearInterval(timer);
  }, [loading]);

  const summary = useMemo(() => [
    form.city,
    form.date && new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${form.date}T00:00:00Z`)),
    form.eventType,
    form.category,
    form.budgetKzt && `до ${money.format(Number(form.budgetKzt))} ₸`,
    form.durationHours && `${form.durationHours} ч.`,
    form.language
  ].filter(Boolean), [form]);

  const update = (field: keyof SearchForm, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const runRecommendation = async (values: SearchForm): Promise<void> => {
    setLoading(true);
    setLoadingStep(0);
    setQuestion(null);
    setError(false);
    setResult(null);
    try {
      const response = await fetch(`${API_URL}/recommendations`, {
        body: JSON.stringify({
          budgetKzt: Number(values.budgetKzt),
          category: values.category,
          city: values.city,
          date: values.date,
          durationHours: values.durationHours ? Number(values.durationHours) : undefined,
          eventType: values.eventType,
          language: values.language || undefined,
          wishes: values.wishes || undefined
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error('Request failed');
      setResult(await response.json() as RecommendationResponse);
      window.setTimeout(() => document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const submitPrompt = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError(false);
    setResult(null);
    try {
      const response = await fetch(`${API_URL}/recommendations/parse`, {
        body: JSON.stringify({ text: prompt }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error('Parse failed');
      const data = await response.json() as ParseResponse;
      const nextForm: SearchForm = {
        ...form,
        ...data.parsed,
        budgetKzt: data.parsed.budgetKzt?.toString() ?? form.budgetKzt,
        durationHours: data.parsed.durationHours?.toString() ?? form.durationHours,
        wishes: prompt
      };
      setForm(nextForm);
      if (data.missing.length) {
        setQuestion(data.question);
        setManualOpen(true);
        setLoading(false);
      } else {
        await runRecommendation(nextForm);
      }
    } catch {
      setLoading(false);
      setError(true);
    }
  };

  const submitManual = (event: FormEvent): void => {
    event.preventDefault();
    void runRecommendation(form);
  };

  const applySuggestion = (suggestion: RecommendationResponse['suggestions'][number]): void => {
    const next = { ...form };
    if (suggestion.type === 'budget') next.budgetKzt = String(suggestion.value);
    if (suggestion.type === 'duration') next.durationHours = String(suggestion.value);
    if (suggestion.type === 'language') next.language = '';
    setForm(next);
    void runRecommendation(next);
  };

  return (
    <main>
      <header className="header">
        <a className="brand" href="#top" aria-label="Evently — на главную">
          <span className="brandMark"><SparkIcon /></span>
          <span>Evently<span className="brandDot">.</span></span>
        </a>
        <nav aria-label="Основная навигация">
          <a href="#how">Как это работает</a>
          <a href="#about">О проекте</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> Умный подбор подрядчиков</div>
        <h1>Найдите подходящего<br /><em>подрядчика для события</em></h1>
        <p className="heroLead">Опишите задачу — AI проверит условия, сравнит кандидатов и предложит до трёх вариантов с понятным объяснением.</p>

        <form className="promptCard" onSubmit={(event) => void submitPrompt(event)}>
          <div className="promptLabel"><SparkIcon /> Расскажите, кого вы ищете</div>
          <textarea
            aria-label="Описание задачи"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: нужен фотограф в Астане на свадьбу 14 ноября. Бюджет до 400 000 ₸, на 8 часов..."
            rows={4}
            value={prompt}
          />
          <div className="promptFooter">
            <span>Можно написать своими словами</span>
            <button className="primaryButton" disabled={loading || !prompt.trim()} type="submit">
              Найти подрядчика <ArrowIcon />
            </button>
          </div>
        </form>

        <button className="manualToggle" onClick={() => setManualOpen((open) => !open)} type="button">
          <span className="sliders">☷</span> Указать параметры вручную
          <span className={manualOpen ? 'chevron open' : 'chevron'}>⌄</span>
        </button>

        {manualOpen && (
          <form className="manualForm" onSubmit={submitManual}>
            {question && <div className="question"><SparkIcon /><div><strong>Нужно уточнение</strong><p>{question}</p></div></div>}
            <div className="formGrid">
              <Field label="Город *"><Select value={form.city} onChange={(value) => update('city', value)} options={metadata.cities} placeholder="Выберите город" /></Field>
              <Field label="Дата *"><input required type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></Field>
              <Field label="Тип мероприятия *"><Select value={form.eventType} onChange={(value) => update('eventType', value)} options={metadata.eventTypes} placeholder="Выберите тип" /></Field>
              <Field label="Категория *"><Select value={form.category} onChange={(value) => update('category', value)} options={metadata.categories} placeholder="Выберите категорию" /></Field>
              <Field label="Бюджет, ₸ *"><input required min="1" inputMode="numeric" type="number" placeholder="400 000" value={form.budgetKzt} onChange={(event) => update('budgetKzt', event.target.value)} /></Field>
              <Field label="Длительность, часов"><input min="1" max="48" type="number" placeholder="Например, 6" value={form.durationHours} onChange={(event) => update('durationHours', event.target.value)} /></Field>
              <Field label="Язык"><Select value={form.language} onChange={(value) => update('language', value)} options={metadata.languages} placeholder="Неважно" /></Field>
              <Field label="Дополнительные пожелания" wide><input type="text" placeholder="Стиль, атмосфера, особенности..." value={form.wishes} onChange={(event) => update('wishes', event.target.value)} /></Field>
            </div>
            <button className="primaryButton wideButton" disabled={loading} type="submit">Подобрать до 3 вариантов <ArrowIcon /></button>
          </form>
        )}
      </section>

      {loading && <Loading step={loadingStep} />}
      {error && (
        <section className="errorState" role="alert">
          <span>!</span><div><h2>Не удалось выполнить подбор</h2><p>Возникла ошибка при обработке запроса. Убедитесь, что API запущен, и попробуйте снова.</p></div>
          <button onClick={() => setManualOpen(true)} type="button">Изменить условия</button>
        </section>
      )}
      {result && <Results form={form} result={result} onEdit={() => setManualOpen(true)} onSuggestion={applySuggestion} summary={summary} />}

      <section className="how" id="how">
        <div className="sectionHeading"><span>Просто и прозрачно</span><h2>Как это работает?</h2></div>
        <div className="steps">
          <Step number="01" title="Опишите задачу">Укажите параметры или просто расскажите своими словами, кого ищете.</Step>
          <Step number="02" title="Мы сравним кандидатов">Проверим дату, бюджет, формат, язык, длительность и содержание профилей.</Step>
          <Step number="03" title="Получите до 3 вариантов">Для каждого кандидата объясним, почему именно он соответствует запросу.</Step>
        </div>
      </section>

      <footer id="about"><div className="brand"><span className="brandMark"><SparkIcon /></span><span>Evently<span className="brandDot">.</span></span></div><p>Объяснимый подбор event-подрядчиков по Казахстану.</p><span>HackAlem · 2026</span></footer>
    </main>
  );
}

function Field({ children, label, wide = false }: { children: React.ReactNode; label: string; wide?: boolean }): React.ReactElement {
  return <label className={wide ? 'field fieldWide' : 'field'}><span>{label}</span>{children}</label>;
}

function Select({ onChange, options, placeholder, value }: { onChange: (value: string) => void; options: string[]; placeholder: string; value: string }): React.ReactElement {
  return <select required={placeholder !== 'Неважно'} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function Loading({ step }: { step: number }): React.ReactElement {
  const labels = ['Проверяю доступность', 'Сверяю условия', 'Сравниваю профили'];
  return <section className="loadingState" aria-live="polite"><div className="loader"><SparkIcon /></div><h2>Подбираю подходящих специалистов...</h2><div className="loadingSteps">{labels.map((label, index) => <span className={index === step ? 'active' : ''} key={label}>{index < step ? '✓' : index + 1} {label}</span>)}</div></section>;
}

function Results({ form, onEdit, onSuggestion, result, summary }: { form: SearchForm; onEdit: () => void; onSuggestion: (item: RecommendationResponse['suggestions'][number]) => void; result: RecommendationResponse; summary: string[] }): React.ReactElement {
  return (
    <section className="results" id="results">
      <div className="resultTop"><div><span className="resultEyebrow">Результаты подбора</span><h2>{result.status === 'matched' ? 'Ваши рекомендации' : 'Подходящих вариантов пока нет'}</h2></div><button className="outlineButton" onClick={onEdit} type="button">Изменить условия</button></div>
      <div className="summary">{summary.map((item) => <span key={item}>{item}</span>)}</div>
      <p className="resultMessage">{result.message}</p>

      {result.items.length > 0 && <div className="cards">{result.items.map((item, index) => <ContractorCard item={item} key={item.id} rank={index + 1} />)}</div>}

      {result.filterSummary.length > 0 && result.items.length === 0 && <div className="blockerPanel"><h3>Что мешает найти?</h3><div>{result.filterSummary.map((reason) => <span key={reason.code}><strong>{reason.count}</strong> {reason.label}</span>)}</div></div>}
      {result.suggestions.length > 0 && <div className="suggestions"><h3>Что можно изменить?</h3>{result.suggestions.map((item) => <button key={item.type} onClick={() => onSuggestion(item)} type="button">{item.label}<ArrowIcon /></button>)}</div>}

      {result.excluded.length > 0 && <details className="excluded"><summary>Кого мы исключили и почему? <span>{result.excluded.length}</span></summary><div className="excludedList">{result.excluded.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>от {money.format(item.priceFromKzt)} ₸</small></div><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>)}</div></details>}
      <span className="srOnly">Параметры формы: {form.city}</span>
    </section>
  );
}

function ContractorCard({ item, rank }: { item: RecommendationItem; rank: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="contractorCard">
      <div className="cardAccent"><span>0{rank}</span></div>
      <div className="cardBody">
        <div className="cardHeader"><div><div className="badges">{item.synthetic && <span className="synthetic">Синтетический профиль</span>}{item.priceImputed && <span>Цена рассчитана</span>}</div><h3>{item.name}</h3><p>{item.categories.join(' · ')} <i /> {item.city}</p></div><div className="price"><small>Стоимость от</small><strong>{money.format(item.priceFromKzt)} ₸</strong></div></div>
        <div className="traits"><span>{item.languages.join(' · ')}</span><span>{item.maxHours ? `до ${item.maxHours} часов` : 'гибкая длительность'}</span><span>{item.eventFormats.slice(0, 3).join(' · ')}</span></div>
        <div className="why"><div className="whyIcon"><SparkIcon /></div><div><strong>Почему он здесь</strong><p>{item.explanation}</p></div></div>
        <button className="detailsButton" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? 'Скрыть описание' : 'Подробнее о профиле'} <span>{expanded ? '↑' : '↓'}</span></button>
        {expanded && <p className="description">{item.description}</p>}
      </div>
    </article>
  );
}

function Step({ children, number, title }: { children: React.ReactNode; number: string; title: string }): React.ReactElement {
  return <article className="step"><span>{number}</span><div className="stepIcon"><SparkIcon /></div><h3>{title}</h3><p>{children}</p></article>;
}
