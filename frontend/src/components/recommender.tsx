"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, CalendarDays, Camera, CheckCircle2,
  CircleAlert, Clock3, Coins, Flower2, Info, Languages, LoaderCircle, MapPin,
  MessageSquareText, MicVocal, Music2, Search, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Controller, type Control, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCatalog, getRecommendations, type Catalog, type IntentParseResponse, type RecommendationRequest, type RecommendationResponse } from "@/lib/api";
import { formSchema, presets, type FormValues } from "@/lib/form";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";
import { IntentAssistant } from "./intent-assistant";
import { Providers } from "./providers";

const money = new Intl.NumberFormat("ru-RU");
const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
type SelectName = "city" | "eventFormat" | "category" | "language";

function Field({ id, label, hint, error, updated, children }: { id: string; label: string; hint?: string; error?: string; updated?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2" data-ai-updated={updated || undefined}>
    <div className="flex min-h-6 items-center justify-between gap-2">
      <Label htmlFor={id} className="font-semibold text-foreground">{label}</Label>
      {updated && <Badge variant="secondary" className="bg-accent text-accent-foreground"><Sparkles />Заполнено AI</Badge>}
    </div>
    <div className={cn(updated && "[&_[data-slot=input]]:border-primary/60 [&_[data-slot=input]]:bg-accent/40 [&_[data-slot=select-trigger]]:border-primary/60 [&_[data-slot=select-trigger]]:bg-accent/40")}>{children}</div>
    {hint && !error && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
  </div>;
}

function SelectField({ id, name, label, options, placeholder, error, disabled, updated, control, onManualChange }: {
  id: string;
  name: SelectName;
  label: string;
  options: string[];
  placeholder: string;
  error?: string;
  disabled?: boolean;
  updated?: boolean;
  control: Control<FormValues>;
  onManualChange: () => void;
}) {
  return <Field id={id} label={label} error={error} updated={updated}>
    <Controller control={control} name={name} render={({ field }) => <Select
      value={field.value || ""}
      onValueChange={(value) => { field.onChange(value === "__any" ? "" : value); onManualChange(); }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {name === "language" && <SelectItem value="__any">Любой язык</SelectItem>}
        {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
      </SelectContent>
    </Select>} />
  </Field>;
}

function categoryIcon(category: string) {
  const value = category.toLowerCase();
  const Icon = value.includes("флор") ? Flower2 : value.includes("фото") ? Camera :
    value.includes("муз") || value.includes("инструм") ? Music2 : value.includes("ведущ") ? MicVocal : BriefcaseBusiness;
  return <Icon aria-hidden="true" />;
}

function ResultsSkeleton() {
  return <section aria-label="Подбор выполняется" role="status" className="min-w-0">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary"><LoaderCircle className="h-5 w-5 animate-spin" /></span>
      <div><p className="font-bold">Анализируем профили</p><p className="mt-1 text-sm text-muted-foreground">Сверяем условия и описания подрядчиков</p></div>
    </div>
    <div className="space-y-4">
      {[0, 1, 2].map((item) => <Card key={item} className="p-5">
        <div className="flex items-start gap-4"><Skeleton className="h-11 w-11 shrink-0" /><div className="flex-1 space-y-3"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-3/5" /><Skeleton className="h-16 w-full" /></div></div>
      </Card>)}
    </div>
  </section>;
}

function EmptyResults() {
  return <Card className="min-h-[430px] justify-center border-dashed bg-white/70 shadow-none">
    <CardContent className="mx-auto max-w-xl px-6 py-12 text-center sm:px-10">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-secondary text-secondary-foreground"><UsersRound className="h-7 w-7" aria-hidden="true" /></span>
      <h2 className="mt-5 text-xl font-extrabold">Результаты появятся здесь</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Заполните параметры события или запустите готовый пример. Мы покажем до трёх профилей с ценой, источником данных и обоснованием выбора.</p>
      <div className="mx-auto mt-7 grid max-w-md gap-3 text-left sm:grid-cols-3">
        {[[ShieldCheck, "Строгие фильтры"], [Sparkles, "AI-ранжирование"], [BadgeCheck, "Проверяемые данные"]].map(([Icon, text]) => {
          const ItemIcon = Icon as typeof ShieldCheck;
          return <div key={String(text)} className="flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-xs font-semibold"><ItemIcon className="h-4 w-4 text-primary" />{String(text)}</div>;
        })}
      </div>
    </CardContent>
  </Card>;
}

function Results({ result, request }: { result: RecommendationResponse; request: RecommendationRequest }) {
  const hasAlternatives = result.alternativeCount > 0 || result.items.some((item) => item.matchType === "alternative");
  const title = result.status === "no_category_in_city"
    ? "В городе нет этой категории"
    : result.status === "no_candidates_after_filters" && hasAlternatives
      ? "Близкие варианты с компромиссом"
      : result.status === "matched"
        ? "Подходящие подрядчики"
        : "Кандидаты есть, но условия не подошли";
  const mode = { ai: "ИИ-анализ", fallback: "Резервный алгоритм", not_needed: "Анализ не потребовался" }[result.analysisMode];
  const exclusions = [
    ["Заняты на дату", result.exclusions.busy], ["Выше бюджета", result.exclusions.budget],
    ["Не тот формат", result.exclusions.format], ["Не тот язык", result.exclusions.language],
    ["Не подходит длительность", result.exclusions.duration],
  ] as const;

  return <section aria-labelledby="results-title" aria-live="polite" className="min-w-0">
    <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase text-primary">Результат подбора</p>
        <h2 id="results-title" className="mt-2 text-2xl font-extrabold tracking-normal">{title}</h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{request.city}</span>
          <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="h-4 w-4" />{request.category}</span>
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{dateLabel.format(new Date(`${request.date}T00:00:00Z`))}</span>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild><Badge variant="outline" className="h-8 shrink-0 border-primary/20 bg-accent text-accent-foreground"><Sparkles />{mode}</Badge></TooltipTrigger>
        <TooltipContent sideOffset={6}>{result.analysisMode === "ai" ? "Порядок определён AI-анализом описаний" : result.analysisMode === "fallback" ? "Использована резервная формула" : "Подходящих кандидатов для ранжирования нет"}</TooltipContent>
      </Tooltip>
    </div>

    <Alert className={result.status === "matched" && !hasAlternatives ? "border-[#b8dfd3] bg-[#eef8f4] text-[#215f50]" : "border-[#e6d3ae] bg-[#fff8e9] text-[#76521f]"}>
      {result.status === "matched" && !hasAlternatives ? <CheckCircle2 /> : <Info />}
      <AlertTitle>{hasAlternatives ? "Есть варианты, но проверьте отличия" : result.status === "matched" ? "Подбор завершён" : "Результат по заданным условиям"}</AlertTitle>
      <AlertDescription className="text-current/85">{result.message}</AlertDescription>
    </Alert>

    {result.items.length > 0 && <ol className="mt-5 space-y-4">
      {result.items.slice(0, 3).map((item, index) => <li key={item.id}>
        <Card className="transition-colors hover:border-primary/30">
          <CardHeader className="border-b border-border bg-[#fbfcfc] sm:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground [&>svg]:h-5 [&>svg]:w-5">{categoryIcon(item.category)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold text-primary">#{index + 1}</span><CardTitle className="break-words text-lg font-extrabold">{item.name}</CardTitle></div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{item.category}</span><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.city}</span></p>
              </div>
            </div>
            <div className="mt-3 text-left sm:mt-0 sm:text-right"><p className="text-xs font-medium text-muted-foreground">Стоимость от</p><p className="mt-1 whitespace-nowrap text-lg font-extrabold">{money.format(item.priceFromKzt)} ₸</p></div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant={item.matchType === "alternative" ? "outline" : "secondary"} className={item.matchType === "alternative" ? "border-[#d6a34e] bg-[#fff8e9] text-[#76521f]" : "bg-accent text-accent-foreground"}>
                {item.matchType === "alternative" ? "Близкая альтернатива" : "Точное совпадение"}
              </Badge>
              <Badge className={item.synthetic ? "bg-[#fff0d9] text-[#7a4d12] hover:bg-[#fff0d9]" : "bg-[#eaf5f0] text-[#26634e] hover:bg-[#eaf5f0]"}>{item.synthetic ? "Синтетический профиль" : "Реальный профиль (анонимизирован)"}</Badge>
              {item.city_imputed && <Badge variant="outline" className="text-muted-foreground">Город добавлен при подготовке</Badge>}
              {item.price_imputed && <Badge variant="outline" className="text-muted-foreground">Цена добавлена при подготовке</Badge>}
            </div>
            {item.differences.length > 0 && <div className="mb-4 rounded-lg border border-[#e6d3ae] bg-[#fff8e9] px-3 py-3 text-xs leading-5 text-[#76521f]">
              <p className="font-extrabold">Что отличается от запроса</p>
              <ul className="mt-1 space-y-1">{item.differences.map((difference) => <li key={`${item.id}-${difference.field}`}>{difference.message}</li>)}</ul>
            </div>}
            <Separator />
            <div className="mt-4 grid gap-3 sm:grid-cols-[130px_1fr]">
              <p className="text-xs font-extrabold uppercase text-muted-foreground">Почему подходит</p>
              <p className="text-sm leading-6 text-foreground/85">{item.explanation}</p>
            </div>
          </CardContent>
        </Card>
      </li>)}
    </ol>}

    {result.totalCandidates > 0 && <div className="mt-5 rounded-lg border border-border bg-white px-4 py-3 text-xs leading-5 text-muted-foreground">
      <p><strong className="text-foreground">Как сформирован выбор:</strong> в каталоге {result.totalCandidates} профилей этой категории, всем условиям соответствуют {result.eligibleCount}. Показано точных вариантов: {result.exactCount}; близких альтернатив: {result.alternativeCount}.</p>
      {exclusions.some(([, count]) => count > 0) && <p className="mt-1"><strong className="text-foreground">Исключено:</strong> {exclusions.filter(([, count]) => count > 0).map(([label, count]) => `${label.toLowerCase()} — ${count}`).join(" · ")}. Один профиль может иметь несколько причин.</p>}
    </div>}
  </section>;
}

function RecommenderContent() {
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: getCatalog });
  const recommendation = useMutation({ mutationFn: getRecommendations, onError: (error) => toast.error(error.message) });
  const [submitted, setSubmitted] = useState<RecommendationRequest | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [aiUpdatedFields, setAiUpdatedFields] = useState<(keyof FormValues)[]>([]);
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
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
    setAiUpdatedFields([]);
    submit(preset.values);
  };

  const choices: Catalog = catalog.data ?? { cities: [], categories: [], eventFormats: [], languages: [], calendar: { from: "2026-09-23", to: "2026-12-31" } };
  const clearPreset = () => setSelectedPreset(null);
  const changedByAi = (field: keyof FormValues) => aiUpdatedFields.includes(field);
  const markManual = (field: keyof FormValues) => {
    clearPreset();
    setAiUpdatedFields((current) => current.filter((item) => item !== field));
  };
  const applyIntent = ({ values }: IntentParseResponse) => {
    const changed: (keyof FormValues)[] = [];
    const options = { shouldDirty: true, shouldValidate: true };
    if (values.city) { setValue("city", values.city, options); changed.push("city"); }
    if (values.date) { setValue("date", values.date, options); changed.push("date"); }
    if (values.eventFormat) { setValue("eventFormat", values.eventFormat, options); changed.push("eventFormat"); }
    if (values.category) { setValue("category", values.category, options); changed.push("category"); }
    if (values.budgetKzt !== undefined) { setValue("budgetKzt", values.budgetKzt, options); changed.push("budgetKzt"); }
    if (values.language) { setValue("language", values.language, options); changed.push("language"); }
    if (values.durationHours !== undefined) { setValue("durationHours", values.durationHours, options); changed.push("durationHours"); }
    clearPreset();
    setAiUpdatedFields((current) => [...new Set([...current, ...changed])]);
  };

  return <main className="min-h-screen bg-background">
    <AppHeader />

    <div className="mx-auto max-w-screen-2xl px-4 pb-16 pt-7 sm:px-6 sm:pt-9 lg:px-8">
      <div className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-extrabold uppercase text-primary">Умный подбор подрядчиков</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-normal sm:text-4xl">Подберите команду под формат события</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Задайте обязательные условия, сравните до трёх подходящих профилей и проверьте аргументы AI по данным подрядчиков.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-border"><ShieldCheck className="h-4 w-4 text-primary" />Занятые исключаются</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-border"><Coins className="h-4 w-4 text-[#986014]" />Цена указана «от»</span>
        </div>
      </div>

      <section aria-label="Примеры запросов" className="py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="shrink-0"><p className="text-xs font-extrabold uppercase text-muted-foreground">Быстрый запуск</p><p className="mt-1 text-sm font-semibold">Готовые сценарии</p></div>
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
            {presets.map((preset) => <Button key={preset.id} type="button" variant="outline" disabled={!catalog.data || recommendation.isPending} onClick={() => choosePreset(preset)} aria-pressed={selectedPreset === preset.id} className="h-auto min-h-14 justify-between gap-3 px-4 py-3 text-left aria-pressed:border-primary aria-pressed:bg-accent">
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{preset.title}</span><span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{preset.description}</span></span><ArrowRight className="shrink-0 text-primary" />
            </Button>)}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[430px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <CardHeader className="border-b border-border bg-[#fbfcfc]">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-primary"><SlidersHorizontal className="h-5 w-5" /></span><div><CardTitle className="text-base font-extrabold">Параметры события</CardTitle><p className="mt-1 text-xs text-muted-foreground">Поля со звёздочкой обязательны</p></div></div>
          </CardHeader>
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <Tabs defaultValue="form">
              <TabsList aria-label="Способ заполнения формы">
                <TabsTrigger value="form"><SlidersHorizontal />Форма</TabsTrigger>
                <TabsTrigger value="chat"><MessageSquareText />Чат (опционально)</TabsTrigger>
              </TabsList>
              <TabsContent value="form" />
              <TabsContent value="chat">
                <IntentAssistant disabled={!catalog.data || recommendation.isPending} onApply={applyIntent} />
              </TabsContent>
            </Tabs>
          </div>
          <form onSubmit={handleSubmit(submit)} onChange={clearPreset} noValidate>
            <CardContent className="space-y-5 pt-5">
              {catalog.isPending && <div role="status" className="space-y-4"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>}
              {catalog.isError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Не удалось загрузить справочник</AlertTitle><AlertDescription><Button type="button" variant="link" className="h-auto p-0 text-destructive" onClick={() => catalog.refetch()}>Повторить загрузку</Button></AlertDescription></Alert>}
              {!catalog.isPending && <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <SelectField id="city" name="city" label="Город *" options={choices.cities} placeholder="Выберите город" disabled={!catalog.data} error={errors.city?.message} updated={changedByAi("city")} control={control} onManualChange={() => markManual("city")} />
                  <Field id="date" label="Дата мероприятия *" error={errors.date?.message} updated={changedByAi("date")}>
                    <Input id="date" type="date" min={choices.calendar.from} max={choices.calendar.to} disabled={!catalog.data} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : undefined} {...register("date", { onChange: () => markManual("date") })} />
                  </Field>
                </div>
                <Separator />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <SelectField id="eventFormat" name="eventFormat" label="Формат мероприятия *" options={choices.eventFormats} placeholder="Выберите формат" disabled={!catalog.data} error={errors.eventFormat?.message} updated={changedByAi("eventFormat")} control={control} onManualChange={() => markManual("eventFormat")} />
                  <SelectField id="category" name="category" label="Категория подрядчика *" options={choices.categories} placeholder="Выберите категорию" disabled={!catalog.data} error={errors.category?.message} updated={changedByAi("category")} control={control} onManualChange={() => markManual("category")} />
                </div>
                <Separator />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <Field id="budgetKzt" label="Бюджет, ₸ *" hint="Максимальная стартовая цена" error={errors.budgetKzt?.message} updated={changedByAi("budgetKzt")}>
                    <div className="relative"><Input id="budgetKzt" type="number" min="1" step="1" inputMode="numeric" placeholder="Например, 900 000" className="pr-10" aria-invalid={!!errors.budgetKzt} aria-describedby={errors.budgetKzt ? "budgetKzt-error" : undefined} {...register("budgetKzt", { valueAsNumber: true, onChange: () => markManual("budgetKzt") })} /><Coins className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></div>
                  </Field>
                  <SelectField id="language" name="language" label="Язык" options={choices.languages} placeholder="Любой язык" disabled={!catalog.data} updated={changedByAi("language")} control={control} onManualChange={() => markManual("language")} />
                  <Field id="durationHours" label="Длительность, часы" hint="Необязательно, максимум 24 часа" error={errors.durationHours?.message} updated={changedByAi("durationHours")}>
                    <div className="relative"><Input id="durationHours" type="number" min="0.1" max="24" step="0.5" inputMode="decimal" placeholder="Необязательно" className="pr-10" aria-invalid={!!errors.durationHours} aria-describedby={errors.durationHours ? "durationHours-error" : undefined} {...register("durationHours", { setValueAs: (value: string) => value === "" ? undefined : Number(value), onChange: () => markManual("durationHours") })} /><Clock3 className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></div>
                  </Field>
                </div>
              </>}
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button type="submit" size="lg" disabled={!catalog.data || recommendation.isPending} className="w-full">
                {recommendation.isPending ? <><LoaderCircle className="animate-spin" />Подбираем подрядчиков</> : <><Search />Найти подрядчиков<ArrowRight /></>}
              </Button>
              <p className="text-center text-[11px] leading-4 text-muted-foreground"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />{dateLabel.format(new Date(`${choices.calendar.from}T00:00:00Z`))} — {dateLabel.format(new Date(`${choices.calendar.to}T00:00:00Z`))}</p>
            </CardFooter>
          </form>
        </Card>

        <div className="min-w-0">
          {recommendation.isPending && <ResultsSkeleton />}
          {!recommendation.isPending && recommendation.isError && <Alert variant="destructive"><CircleAlert /><AlertTitle>Подбор не выполнен</AlertTitle><AlertDescription>{recommendation.error.message}</AlertDescription></Alert>}
          {!recommendation.isPending && recommendation.isSuccess && submitted && <Results result={recommendation.data} request={submitted} />}
          {!recommendation.isPending && !recommendation.isSuccess && !recommendation.isError && <EmptyResults />}
          <div className="mt-5 grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
            <p className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#986014]" />Синтетические профили и дополненные данные всегда отмечаются в карточке.</p>
            <p className="flex items-start gap-2"><Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Язык и длительность применяются только тогда, когда вы их указываете.</p>
          </div>
        </div>
      </div>
    </div>
  </main>;
}

export function Recommender() {
  return <Providers><RecommenderContent /></Providers>;
}
