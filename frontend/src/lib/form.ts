import { z } from "zod";

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const formSchema = z.object({
  city: z.string().trim().min(1, "Выберите город"),
  date: z.string().refine((value) => validDate(value) && value >= "2026-09-23" && value <= "2026-12-31", "Выберите дату с 23 сентября по 31 декабря 2026 года"),
  eventFormat: z.string().trim().min(1, "Выберите формат"),
  category: z.string().trim().min(1, "Выберите категорию"),
  budgetKzt: z.number({ error: "Укажите бюджет" }).int("Введите целое число").positive("Бюджет должен быть больше нуля"),
  language: z.string().optional(),
  durationHours: z.number().gt(0, "Длительность должна быть больше нуля").lte(24, "Не более 24 часов").optional(),
});

export type FormValues = z.infer<typeof formSchema>;

export const presets: { id: string; title: string; description: string; values: FormValues }[] = [
  {
    id: "dense", title: "Корпоратив · ведущий", description: "Алматы · 3 точных варианта",
    values: { city: "Алматы", date: "2026-10-15", eventFormat: "корпоратив", category: "Ведущий", budgetKzt: 900000, language: "русский" },
  },
  {
    id: "rare", title: "Корпоратив · флорист", description: "Астана · редкая категория",
    values: { city: "Астана", date: "2026-11-14", eventFormat: "корпоратив", category: "Флорист", budgetKzt: 900000, language: "русский" },
  },
  {
    id: "date-alternatives", title: "Корпоратив · новая дата", description: "Алматы · близкие альтернативы",
    values: { city: "Алматы", date: "2026-12-20", eventFormat: "корпоратив", category: "Ведущий", budgetKzt: 900000, language: "русский" },
  },
  {
    id: "wedding-photo", title: "Свадьба · фотограф", description: "Алматы · съёмка на 6 часов",
    values: { city: "Алматы", date: "2026-10-15", eventFormat: "свадьба", category: "Фотограф", budgetKzt: 900000, language: "русский", durationHours: 6 },
  },
  {
    id: "toi-host", title: "Той · ведущий", description: "Астана · казахский язык",
    values: { city: "Астана", date: "2026-10-15", eventFormat: "той", category: "Ведущий", budgetKzt: 1200000, language: "казахский", durationHours: 6 },
  },
  {
    id: "wedding-venue", title: "Свадьба · банкетный зал", description: "Алматы · точный и близкие",
    values: { city: "Алматы", date: "2026-11-20", eventFormat: "свадьба", category: "Банкетный зал", budgetKzt: 3000000, language: "русский" },
  },
];
