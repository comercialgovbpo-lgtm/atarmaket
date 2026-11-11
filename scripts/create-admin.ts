/**
 * Cria (ou promove) um administrador da plataforma.
 * Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME="..." npm run create-admin
 */
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrador";
  if (!email || !password || password.length < 12) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 12 caracteres)");
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.role','system',true)");
  const hash = await bcrypt.hash(password, 12);
  await c.query(
    `INSERT INTO users(email, password_hash, full_name, platform_role, terms_accepted_at, privacy_accepted_at)
     VALUES ($1,$2,$3,'admin',now(),now())
     ON CONFLICT (email) DO UPDATE SET platform_role = 'admin', password_hash = EXCLUDED.password_hash, status = 'active'`, [email, hash, name]);
  await c.query("INSERT INTO audit_logs(action, entity_type, metadata) VALUES ('admin_criado_cli','user',$1)", [JSON.stringify({ email })]);
  await c.query("COMMIT");
  await c.end();
  console.log(`Administrador pronto: ${email}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
