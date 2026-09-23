import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowed = new Set(["city", "category", "profileType", "search", "page", "limit"]);

export async function GET(request: NextRequest) {
  try {
    const base = process.env.BACKEND_URL || "http://localhost:3001";
    const target = new URL("/api/v1/contractors", base);
    request.nextUrl.searchParams.forEach((value, key) => {
      if (allowed.has(key)) target.searchParams.set(key, value);
    });
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ message: "Каталог сейчас недоступен. Попробуйте позже." }, { status: 502 });
  }
}
