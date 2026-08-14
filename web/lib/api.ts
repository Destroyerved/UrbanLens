import { NextRequest, NextResponse } from "next/server";

export function cityIdFrom(req: NextRequest): string | undefined {
  return req.nextUrl.searchParams.get("city") ?? undefined;
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
