"use client";

import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, Database, FilterX, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatasetContractor, DatasetProfileType, getDataset, getDatasetCatalog } from "@/lib/dataset-api";

const money = new Intl.NumberFormat("ru-RU");
const ALL = "all";

type Filters = { city: string; category: string; profileType: string };

function ProvenanceBadge({ profile }: { profile: DatasetContractor }) {
  return <Badge
    className={profile.isSynthetic
      ? "bg-synthetic-bg text-synthetic-text hover:bg-synthetic-bg"
      : "bg-source-bg text-source-text hover:bg-source-bg"}
    title={profile.isSynthetic ? "Профиль полностью создан для датасета" : "Исходный профиль с анонимизированным именем"}
  >
    {profile.isSynthetic ? "Синтетический профиль" : "Настоящий профиль"}
  </Badge>;
}

function DetailBadges({ profile }: { profile: DatasetContractor }) {
  return <div className="flex flex-wrap gap-1.5">
    {profile.categories.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}
    {profile.cityImputed && <Badge variant="outline">Город дополнен</Badge>}
    {profile.priceImputed && <Badge variant="outline">Цена дополнена</Badge>}
  </div>;
}

function DatasetTable({ items }: { items: DatasetContractor[] }) {
  return <div className="hidden overflow-hidden rounded-lg border border-border bg-white lg:block">
    <Table>
      <TableHeader><TableRow>
        <TableHead className="w-[27%]">Профиль</TableHead>
        <TableHead className="w-[18%]">Категории</TableHead>
        <TableHead className="w-[20%]">Форматы и языки</TableHead>
        <TableHead className="w-[13%]">Цена от</TableHead>
        <TableHead className="w-[22%]">Происхождение</TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.map((profile) => <TableRow key={profile.id}>
        <TableCell>
          <p className="font-extrabold text-foreground">{profile.name}</p>
          <p className="mt-1 text-xs font-semibold text-primary">{profile.id}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{profile.description}</p>
        </TableCell>
        <TableCell><p className="mb-2 text-sm font-semibold">{profile.city}</p><DetailBadges profile={profile} /></TableCell>
        <TableCell>
          <p className="text-sm leading-5">{profile.eventFormats.join(", ")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{profile.languages.join(", ")}{profile.maxHours ? ` · до ${profile.maxHours} ч` : " · без лимита по часам"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Занятых дат: {profile.busyDates.length}</p>
        </TableCell>
        <TableCell className="whitespace-nowrap font-extrabold">{money.format(profile.priceFromKzt)} ₸</TableCell>
        <TableCell><ProvenanceBadge profile={profile} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

function DatasetCards({ items }: { items: DatasetContractor[] }) {
  return <div className="grid gap-3 lg:hidden">{items.map((profile) => <Card key={profile.id}>
    <CardHeader className="gap-3 border-b border-border bg-[#fbfcfc]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><CardTitle className="break-words text-base">{profile.name}</CardTitle><p className="mt-1 text-xs font-semibold text-primary">{profile.id} · {profile.city}</p></div>
        <p className="whitespace-nowrap text-sm font-extrabold">от {money.format(profile.priceFromKzt)} ₸</p>
      </div>
      <ProvenanceBadge profile={profile} />
    </CardHeader>
    <CardContent className="space-y-3 pt-4">
      <DetailBadges profile={profile} />
      <p className="text-xs leading-5 text-muted-foreground">{profile.description}</p>
      <p className="text-xs leading-5"><strong>Форматы:</strong> {profile.eventFormats.join(", ")}</p>
      <p className="text-xs leading-5"><strong>Языки:</strong> {profile.languages.join(", ")}</p>
      <p className="text-xs leading-5"><strong>Календарь:</strong> занято {profile.busyDates.length} дат</p>
    </CardContent>
  </Card>)}</div>;
}

function LoadingState() {
  return <div role="status" aria-label="Загрузка датасета" className="space-y-3">
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-28 w-full" />
    <Skeleton className="h-28 w-full" />
  </div>;
}

export function DatasetExplorer() {
  const [filters, setFilters] = useState<Filters>({ city: ALL, category: ALL, profileType: ALL });
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const catalog = useQuery({ queryKey: ["dataset-catalog"], queryFn: getDatasetCatalog });
  const dataset = useQuery({
    queryKey: ["dataset", filters, search, page],
    queryFn: () => getDataset({
      city: filters.city === ALL ? undefined : filters.city,
      category: filters.category === ALL ? undefined : filters.category,
      profileType: filters.profileType === ALL ? undefined : filters.profileType as DatasetProfileType,
      search: search || undefined,
      page,
      limit: 12,
    }),
    placeholderData: (previous) => previous,
  });

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };
  const changeFilter = (key: keyof Filters, value: string) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => {
    setFilters({ city: ALL, category: ALL, profileType: ALL });
    setSearchDraft("");
    setSearch("");
    setPage(1);
  };
  const hasFilters = search !== "" || Object.values(filters).some((value) => value !== ALL);
  const choices = catalog.data ?? { cities: [], categories: [], eventFormats: [], languages: [], calendar: { from: "", to: "" } };

  return <main className="mx-auto max-w-screen-2xl px-4 pb-16 pt-7 sm:px-6 sm:pt-9 lg:px-8">
    <div className="border-b border-border pb-6">
      <p className="text-xs font-extrabold uppercase text-primary">Исходные данные</p>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Датасет подрядчиков</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Анонимизированные профили, на которых работает подбор. Происхождение и дополненные поля отмечены у каждой записи.</p></div>
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Database className="h-4 w-4 text-primary" /><span>66 профилей в исходном CSV</span></div>
      </div>
    </div>

    <section aria-label="Фильтры датасета" className="border-b border-border py-5">
      <form onSubmit={applySearch} className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_repeat(3,minmax(150px,1fr))_auto] lg:items-end">
        <div className="space-y-1.5"><Label htmlFor="dataset-search">Поиск</Label><div className="relative"><Input id="dataset-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Имя, ID или описание" className="pr-10" /><Search className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></div></div>
        <div className="space-y-1.5"><Label>Город</Label><Select value={filters.city} onValueChange={(value) => changeFilter("city", value)} disabled={catalog.isPending}><SelectTrigger aria-label="Город"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все города</SelectItem>{choices.cities.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Категория</Label><Select value={filters.category} onValueChange={(value) => changeFilter("category", value)} disabled={catalog.isPending}><SelectTrigger aria-label="Категория"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все категории</SelectItem>{choices.categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Тип профиля</Label><Select value={filters.profileType} onValueChange={(value) => changeFilter("profileType", value)}><SelectTrigger aria-label="Тип профиля"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Все профили</SelectItem><SelectItem value="real">Настоящие</SelectItem><SelectItem value="synthetic">Синтетические</SelectItem></SelectContent></Select></div>
        <div className="flex gap-2"><Button type="submit" className="flex-1 lg:flex-none"><Search />Найти</Button>{hasFilters && <Button type="button" variant="outline" size="icon" onClick={clearFilters} title="Сбросить фильтры" aria-label="Сбросить фильтры"><FilterX /></Button>}</div>
      </form>
      {catalog.isError && <Alert variant="destructive" className="mt-3"><AlertCircle /><AlertTitle>Фильтры временно недоступны</AlertTitle><AlertDescription>Профили можно просматривать и искать по тексту. <Button type="button" variant="link" className="h-auto p-0 text-destructive" onClick={() => catalog.refetch()}>Повторить загрузку справочников</Button></AlertDescription></Alert>}
    </section>

    <section aria-label="Профили датасета" className="pt-5">
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm font-semibold" aria-live="polite">{dataset.data ? `Найдено: ${dataset.data.total}` : "Загружаем профили"}</p>
        {dataset.data && dataset.data.total > 0 && <p className="text-xs text-muted-foreground">Страница {dataset.data.page} из {dataset.data.totalPages}</p>}
      </div>
      {dataset.isPending && <LoadingState />}
      {dataset.isError && <Alert variant="destructive"><AlertCircle /><AlertTitle>Не удалось открыть датасет</AlertTitle><AlertDescription>{dataset.error.message} <Button type="button" variant="link" className="h-auto p-0 text-destructive" onClick={() => dataset.refetch()}>Повторить</Button></AlertDescription></Alert>}
      {dataset.data && dataset.data.items.length === 0 && <div className="py-16 text-center"><Database className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 text-lg font-extrabold">Профили не найдены</h2><p className="mt-2 text-sm text-muted-foreground">Измените поиск или снимите часть фильтров.</p>{hasFilters && <Button type="button" variant="outline" className="mt-5" onClick={clearFilters}><FilterX />Сбросить фильтры</Button>}</div>}
      {dataset.data && dataset.data.items.length > 0 && <><DatasetTable items={dataset.data.items} /><DatasetCards items={dataset.data.items} /></>}
      {dataset.data && dataset.data.totalPages > 1 && <div className="mt-6 flex items-center justify-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Предыдущая страница" disabled={page <= 1 || dataset.isFetching} onClick={() => setPage((current) => current - 1)}><ChevronLeft /></Button>
        <span className="min-w-24 text-center text-sm font-semibold">{dataset.data.page} / {dataset.data.totalPages}</span>
        <Button type="button" variant="outline" size="icon" aria-label="Следующая страница" disabled={page >= dataset.data.totalPages || dataset.isFetching} onClick={() => setPage((current) => current + 1)}><ChevronRight /></Button>
      </div>}
    </section>
  </main>;
}
