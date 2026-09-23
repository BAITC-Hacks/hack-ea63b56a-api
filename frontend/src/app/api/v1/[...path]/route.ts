import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!["catalog", "recommendations", "health"].includes(endpoint)) {
    return NextResponse.json({ message: "Маршрут не найден" }, { status: 404 });
  }
  if ((endpoint === "recommendations" && request.method !== "POST") || (endpoint !== "recommendations" && request.method !== "GET")) {
    return NextResponse.json({ message: "Метод не поддерживается" }, { status: 405 });
  }
  try {
    const base = process.env.BACKEND_URL || "http://localhost:3001";
    const target = new URL(`/api/v1/${endpoint}`, base);
    const response = await fetch(target, {
      method: request.method,
      headers: request.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ message: "Сервис подбора сейчас недоступен. Попробуйте позже." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
