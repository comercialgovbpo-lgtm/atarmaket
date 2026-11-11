import "server-only";
import bcrypt from "bcryptjs";

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

let dummy: string | null = null;
/** Executa uma verificação "falsa" para equalizar o tempo de resposta quando o e-mail não existe. */
export async function dummyVerify(p: string) {
  dummy ??= await bcrypt.hash("dummy-password-for-timing", 12);
  await bcrypt.compare(p, dummy);
  return false;
}
