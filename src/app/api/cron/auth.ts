import { timingSafeEqual } from "node:crypto";

/** Vercel Cron envia "Authorization: Bearer <CRON_SECRET>". */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const exp = Buffer.from(`Bearer ${secret}`);
  return got.length === exp.length && timingSafeEqual(got, exp);
}
