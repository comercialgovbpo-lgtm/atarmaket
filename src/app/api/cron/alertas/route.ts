import { NextResponse } from "next/server";
import { runAlerts } from "@/lib/alerts";
import { cronAuthorized } from "../auth";

export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await runAlerts());
}
