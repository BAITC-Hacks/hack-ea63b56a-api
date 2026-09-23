"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarDays, CircleAlert, Clock3, Coins, Info, LoaderCircle, MapPin, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import * as Label from "@radix-ui/react-label";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import Image from "next/image";
import { getCatalog, getRecommendations, type Catalog, type RecommendationRequest, type RecommendationResponse } from "@/lib/api";
import { formSchema, presets, type FormValues } from "@/lib/form";
import { Providers } from "./providers";

const money = new Intl.NumberFormat("ru-RU");
const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fieldClass = "mt-2 h-12 w-full rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink shadow-sm transition-colors placeholder:text-muted/70 hover:border-[#a8b9b4] focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/15 disabled:cursor-not-allowed disabled:bg-canvas";

function Brand() {
  return <div className="flex items-center gap-3" aria-label="HackAlem">
    <Image src="/brand-mark.svg" width={40} height={40} alt="" aria-hidden="true" />
    <span className="text-lg font-extrabold tracking-[-.035em]">HackAlem<span className="text-teal">.</span></span>
  </div>;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <div>
    <Label.Root htmlFor={id} className="block text-sm font-bold text-ink">{label}</Label.Root>
    {children}
    {hint && !error && <p className="mt-1.5 text-xs leading-5 text-muted">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}

function SelectField({ id, label, options, placeholder, error, disabled, registration }: {
  id: string; label: string; options: string[]; placeholder: string; error?: string; disabled?: boolean;
  registration: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]>;
}) {
  return <Field id={id} label={label} error={error}>
    <select id={id} className={fieldClass} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled} {...registration}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </Field>;
}

function Results({ result, request }: { result: RecommendationResponse; request: RecommendationRequest }) {
  const title = result.status === "matched" ? "Подходящие подрядчики" : result.status === "no_category_in_city" ? "В городе нет этой категории" : "Кандидаты есть, но условия не подошли";
  const mode = { ai: "ИИ-анализ", fallback: "Резервный алгоритм", not_needed: "Анализ не потребовался" }[result.analysisMode];
  const exclusions = [
    ["Заняты на дату", result.exclusions.busy], ["Выше бюджета", result.exclusions.budget],
    ["Не тот формат", result.exclusions.format], ["Не тот язык", result.exclusions.language],
    ["Не подходит длительность", result.exclusions.duration],
  ] as const;
  return <section className="mt-9 border-t border-line pt-8" aria-labelledby="results-title" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[.15em] text-teal">Результат подбора</p>
        <h2 id="results-title" className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted">{request.city} · {request.category} · {dateLabel.format(new Date(`${request.date}T00:00:00Z`))}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted"><Sparkles size={14} aria-hidden="true" />{mode}</span>
    </div>
    <div className={`mt-5 rounded-xl border px-4 py-3.5 text-sm leading-6 ${result.status === "matched" ? "border-[#cbe7df] bg-[#eef8f4] text-[#225d51]" : "border-[#eadcc5] bg-[#fcf7ed] text-[#76521f]"}`}>
      <p className="font-semibold">{result.message}</p>
    </div>
    {result.items.length > 0 && <ol className="mt-5 divide-y divide-line rounded-2xl border border-line bg-white px-5 shadow-panel sm:px-7">
      {result.items.slice(0, 3).map((item, index) => <li key={item.id} className="py-6 first:pt-5 last:pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e8f3ef] text-xs font-extrabold text-teal">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="break-words text-base font-extrabold sm:text-lg">{item.name}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span>{item.category}</span><span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{item.city}</span></p>
            </div>
          </div>
          <div className="text-left sm:text-right"><p className="text-xs text-muted">Стоимость от</p><p className="mt-0.5 whitespace-nowrap text-base font-extrabold">{money.format(item.priceFromKzt)} ₸</p></div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[#425153]">{item.explanation}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-md px-2.5 py-1 ${item.synthetic ? "bg-[#fff0d9] text-[#835316]" : "bg-[#eaf5f0] text-[#26634e]"}`}>{item.synthetic ? "Синтетический профиль" : "Профиль из данных"}</span>
          {item.city_imputed && <span className="rounded-md bg-[#f3f4f3] px-2.5 py-1 text-muted">Город указан приблизительно</span>}
          {item.price_imputed && <span className="rounded-md bg-[#f3f4f3] px-2.5 py-1 text-muted">Цена оценочная</span>}
        </div>
      </li>)}
    </ol>}
    {result.totalCandidates > 0 && <div className="mt-5 text-xs leading-5 text-muted">
      <p>В городе и категории: {result.totalCandidates}. Прошли условия: {result.eligibleCount}. Показано: {result.count}.</p>
      {exclusions.some(([, count]) => count > 0) && <p className="mt-1">Причины исключения: {exclusions.filter(([, count]) => count > 0).map(([label, count]) => `${label.toLowerCase()} — ${count}`).join(" · ")}. Один профиль может иметь несколько причин.</p>}
    </div>}
  </section>;
}

function RecommenderContent() {
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: getCatalog });
  const recommendation = useMutation({ mutationFn: getRecommendations, onError: (error) => toast.error(error.message) });
  const [submitted, setSubmitted] = useState<RecommendationRequest | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { city: "", date: "", eventFormat: "", category: "", budgetKzt: undefined, language: "", durationHours: undefined },
  });

  const submit = (values: FormValues) => {
    const input: RecommendationRequest = {
      city: values.city.trim(), date: values.date, eventFormat: values.eventFormat.trim(),
      category: values.category.trim(), budgetKzt: values.budgetKzt,
      ...(values.language?.trim() ? { language: values.language.trim() } : {}),
      ...(values.durationHours !== undefined ? { durationHours: values.durationHours } : {}),
    };
    setSubmitted(input);
    recommendation.mutate(input);
  };

  const choosePreset = (preset: typeof presets[number]) => {
    reset(preset.values);
    setSelectedPreset(preset.id);
    submit(preset.values);
  };

  const choices: Catalog = catalog.data ?? { cities: [], categories: [], eventFormats: [], languages: [], calendar: { from: "2026-09-23", to: "2026-12-31" } };
  return <main className="min-h-screen">
    <header className="border-b border-line bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Brand /><span className="hidden text-sm font-semibold text-muted sm:block">Умный подбор подрядчиков для событий</span></div></header>
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-9 sm:px-8 sm:pt-14">
      <div className="mb-8 max-w-3xl sm:mb-10">
        <p className="mb-3 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.17em] text-teal"><span className="h-1.5 w-1.5 rounded-full bg-teal" /> Подбор по вашему запросу</p>
        <h1 className="text-3xl font-extrabold leading-tight tracking-[-.045em] sm:text-4xl">Найдите подрядчика для мероприятия</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">Укажите дату, город и условия. Покажем до трёх подходящих профилей и объясним, почему они подходят.</p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
        <div className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-panel sm:p-8">
          <div className="mb-7 flex items-center gap-3 border-b border-line pb-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8f3ef] text-teal"><SlidersHorizontal size={19} /></span><div><h2 className="font-extrabold">Параметры события</h2><p className="mt-0.5 text-xs text-muted">Поля со звёздочкой обязательны</p></div></div>
          {catalog.isPending && <p role="status" className="mb-5 flex items-center gap-2 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" /> Загружаем города и категории…</p>}
          {catalog.isError && <div role="alert" className="mb-5 rounded-xl border border-[#eadcc5] bg-[#fcf7ed] p-4 text-sm text-[#76521f]">Не удалось загрузить справочник. <button type="button" onClick={() => catalog.refetch()} className="font-bold underline underline-offset-2">Повторить</button></div>}
          <form onSubmit={handleSubmit(submit)} onChange={() => setSelectedPreset(null)} noValidate>
            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <SelectField id="city" label="Город *" options={choices.cities} placeholder="Выберите город" disabled={!catalog.data} error={errors.city?.message} registration={register("city")} />
              <Field id="date" label="Дата мероприятия *" error={errors.date?.message}>
                <div className="relative"><input id="date" type="date" min={choices.calendar.from} max={choices.calendar.to} disabled={!catalog.data} className={fieldClass} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : undefined} {...register("date")} /><CalendarDays className="pointer-events-none absolute right-10 top-[26px] hidden text-muted sm:block" size={16} aria-hidden="true" /></div>
              </Field>
              <SelectField id="eventFormat" label="Формат мероприятия *" options={choices.eventFormats} placeholder="Выберите формат" disabled={!catalog.data} error={errors.eventFormat?.message} registration={register("eventFormat")} />
              <SelectField id="category" label="Категория подрядчика *" options={choices.categories} placeholder="Выберите категорию" disabled={!catalog.data} error={errors.category?.message} registration={register("category")} />
              <Field id="budgetKzt" label="Бюджет, ₸ *" hint="Максимальная стоимость услуги" error={errors.budgetKzt?.message}>
                <div className="relative"><input id="budgetKzt" type="number" min="1" step="1" inputMode="numeric" placeholder="Например, 900 000" className={`${fieldClass} pr-10`} aria-invalid={!!errors.budgetKzt} aria-describedby={errors.budgetKzt ? "budgetKzt-error" : undefined} {...register("budgetKzt", { valueAsNumber: true })} /><Coins className="pointer-events-none absolute right-4 top-[26px] text-muted" size={17} aria-hidden="true" /></div>
              </Field>
              <SelectField id="language" label="Язык" options={choices.languages} placeholder="Любой язык" disabled={!catalog.data} registration={register("language")} />
              <Field id="durationHours" label="Длительность, часы" hint="Если для услуги важно время на площадке" error={errors.durationHours?.message}>
                <div className="relative"><input id="durationHours" type="number" min="0.1" max="24" step="0.5" inputMode="decimal" placeholder="Необязательно" className={`${fieldClass} pr-10`} aria-invalid={!!errors.durationHours} aria-describedby={errors.durationHours ? "durationHours-error" : undefined} {...register("durationHours", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })} /><Clock3 className="pointer-events-none absolute right-4 top-[26px] text-muted" size={17} aria-hidden="true" /></div>
              </Field>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-6"><button type="submit" disabled={!catalog.data || recommendation.isPending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal px-6 text-sm font-extrabold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-55">{recommendation.isPending ? <><LoaderCircle size={17} className="animate-spin" /> Подбираем…</> : <><Search size={17} /> Найти подрядчиков <ArrowRight size={17} /></>}</button><p className="text-xs leading-5 text-muted">Доступные даты: 23 сентября — 31 декабря 2026</p></div>
          </form>
          {recommendation.isError && <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-[#eadcc5] bg-[#fcf7ed] p-4 text-sm text-[#76521f]"><CircleAlert size={18} className="mt-0.5 shrink-0" /><p>{recommendation.error.message}</p></div>}
          {recommendation.isSuccess && submitted && <Results result={recommendation.data} request={submitted} />}
        </div>
        <aside className="lg:pt-1" aria-label="Примеры запросов">
          <div className="mb-4"><p className="text-xs font-extrabold uppercase tracking-[.15em] text-teal">Быстрый старт</p><h2 className="mt-2 text-lg font-extrabold">Попробуйте пример</h2><p className="mt-1 text-sm leading-6 text-muted">Примеры заполнят форму и запустят подбор.</p></div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
            {presets.map((preset) => <button key={preset.id} type="button" disabled={!catalog.data || recommendation.isPending} onClick={() => choosePreset(preset)} aria-pressed={selectedPreset === preset.id} className="group flex w-full items-center justify-between gap-3 border-b border-line px-4 py-4 text-left last:border-b-0 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-55 aria-pressed:bg-[#edf6f2]"><span><span className="block text-sm font-bold text-ink">{preset.title}</span><span className="mt-1 block text-xs text-muted">{preset.description}</span></span><ArrowRight size={16} className="shrink-0 text-teal transition-transform group-hover:translate-x-0.5" /></button>)}
          </div>
          <div className="mt-6 border-t border-line pt-5 text-xs leading-5 text-muted"><p className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0 text-amber" /> Цены указаны «от». Синтетические профили и приблизительные данные отмечены в результатах.</p><p className="mt-3 flex items-start gap-2"><BadgeCheck size={16} className="mt-0.5 shrink-0 text-teal" /> Занятые на выбранную дату подрядчики исключаются из выдачи.</p></div>
        </aside>
      </div>
    </div>
  </main>;
}

export function Recommender() {
  return <Providers><RecommenderContent /></Providers>;
}
