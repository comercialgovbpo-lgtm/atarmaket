import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return req("DATABASE_URL"); },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get cronSecret() { return process.env.CRON_SECRET ?? ""; },
  get anthropicKey() { return process.env.ANTHROPIC_API_KEY ?? ""; },
  get extractionModel() { return process.env.EXTRACTION_MODEL ?? "claude-opus-5-5"; },
  get storageDriver() { return (process.env.STORAGE_DRIVER ?? "local") as "local" | "supabase"; },
  get storageLocalDir() { return process.env.STORAGE_LOCAL_DIR ?? "./storage"; },
  get supabaseUrl() { return process.env.SUPABASE_URL ?? ""; },
  get supabaseServiceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; },
  get supabaseBucket() { return process.env.SUPABASE_STORAGE_BUCKET ?? "ata-documents"; },
  get paymentProvider() { return (process.env.PAYMENT_PROVIDER ?? "none") as "none" | "stripe" | "mercadopago"; },
  get stripeSecret() { return process.env.STRIPE_SECRET_KEY ?? ""; },
  get stripeWebhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET ?? ""; },
  get mercadoPagoToken() { return process.env.MERCADOPAGO_ACCESS_TOKEN ?? ""; },
  get mercadoPagoWebhookSecret() { return process.env.MERCADOPAGO_WEBHOOK_SECRET ?? ""; },
  get smtpUrl() { return process.env.SMTP_URL ?? ""; },
  get isProd() { return process.env.NODE_ENV === "production"; },
};
