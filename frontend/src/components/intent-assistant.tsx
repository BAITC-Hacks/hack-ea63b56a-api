"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, MessageSquareText, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseIntent, type IntentParseResponse } from "@/lib/api";

type IntentAssistantProps = {
  disabled?: boolean;
  onApply: (result: IntentParseResponse) => void;
};

const fieldLabels: Record<string, string> = {
  city: "город",
  date: "дата",
  eventFormat: "формат",
  category: "категория",
  budgetKzt: "бюджет",
  language: "язык",
  durationHours: "длительность",
};

function readableFields(fields: string[]) {
  return fields.map((field) => fieldLabels[field] ?? field).join(", ");
}

export function IntentAssistant({ disabled, onApply }: IntentAssistantProps) {
  const [message, setMessage] = useState("");
  const intent = useMutation({
    mutationFn: parseIntent,
    onSuccess: onApply,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = message.trim();
    if (value) intent.mutate(value);
  };

  const updated = intent.data ? Object.keys(intent.data.values) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>Опишите событие своими словами. Помощник заполнит только распознанные поля, а вы сможете всё проверить.</p>
      </div>
      <form onSubmit={submit} className="space-y-2" aria-busy={intent.isPending}>
        <label htmlFor="intent-message" className="sr-only">Описание события</label>
        <Textarea
          id="intent-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Например: хочу свадьбу на 65 000 тенге"
          disabled={disabled || intent.isPending}
          maxLength={1000}
        />
        <Button type="submit" className="w-full" disabled={disabled || intent.isPending || !message.trim()}>
          {intent.isPending ? <><LoaderCircle className="animate-spin" />Разбираем запрос</> : <><Send />Заполнить форму</>}
        </Button>
      </form>

      {intent.isPending && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" />Выделяем параметры и сверяем их со справочником...</p>}

      {intent.isError && <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Не удалось разобрать описание</AlertTitle>
        <AlertDescription>{intent.error.message}</AlertDescription>
      </Alert>}

      {intent.isSuccess && <Alert className="border-[#b8dfd3] bg-[#eef8f4] text-[#215f50]">
        <Sparkles />
        <AlertTitle>{updated.length ? "Форма обновлена" : "Нужны дополнительные детали"}</AlertTitle>
        <AlertDescription className="space-y-2 text-current/85">
          {updated.length > 0 && <p>Заполнили: {readableFields(updated)}. Проверьте значения перед подбором.</p>}
          {intent.data.assumptions.length > 0 && <p>Учли как предположение: {intent.data.assumptions.join("; ")}.</p>}
          {intent.data.missing.length > 0 && <p>Осталось указать: {readableFields(intent.data.missing)}.</p>}
          <Badge variant="outline" className="border-current/20 bg-white/60 text-current">
            {intent.data.analysisMode === "ai" ? "AI-анализ" : "Резервный разбор"} · {Math.round(intent.data.confidence * 100)}%
          </Badge>
        </AlertDescription>
      </Alert>}
    </div>
  );
}
