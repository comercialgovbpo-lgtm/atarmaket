/**
 * Testes de isolamento (Row Level Security) executados com o papel da APLICAÇÃO (DATABASE_URL, sem BYPASSRLS).
 * Tudo roda dentro de uma transação desfeita ao final: nenhum dado permanece no banco.
 * Requer banco migrado. Uso: npm run test:rls
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

const db = new Client({ connectionString: process.env.DATABASE_URL });
const as = (role: string, uid = "") => db.query("SELECT set_config('app.role',$1,true), set_config('app.user_id',$2,true)", [role, uid]);
const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];
const count = async (sql: string, p: unknown[] = []) => Number((await db.query(sql, p)).rows[0].n);
const rejects = async (fn: () => Promise<unknown>, label: string) => {
  await db.query("SAVEPOINT sp");
  try { await fn(); assert.fail(`deveria ser bloqueado: ${label}`); }
  catch (e) { if ((e as Error).message.startsWith("deveria")) throw e; }
  finally { await db.query("ROLLBACK TO SAVEPOINT sp"); }
};

const ids: Record<string, string> = {};

before(async () => {
  await db.connect();
  await db.query("BEGIN");
  await as("system");
  const mk = async (email: string) => (await one("INSERT INTO users(email,password_hash,full_name) VALUES ($1,'x','Teste RLS') RETURNING id", [email])).id;
  ids.uA = await mk("rls-a@teste.invalid"); ids.uB = await mk("rls-b@teste.invalid"); ids.uG = await mk("rls-g@teste.invalid");
  const org = async (kind: string, cnpj: string, uid: string) => {
    const id = (await one("INSERT INTO organizations(kind,cnpj,legal_name) VALUES ($1,$2,$3) RETURNING id", [kind, cnpj, `Org ${cnpj}`])).id;
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,$2,'owner')", [id, uid]);
    return id;
  };
  ids.oA = await org("supplier", "90000000000101", ids.uA);
  ids.oB = await org("supplier", "90000000000202", ids.uB);
  ids.oG = await org("government", "90000000000303", ids.uG);
  ids.sA = (await one("INSERT INTO suppliers(cnpj,legal_name,organization_id) VALUES ('90000000000101','Fornecedor A',$1) RETURNING id", [ids.oA])).id;
  ids.sB = (await one("INSERT INTO suppliers(cnpj,legal_name,organization_id) VALUES ('90000000000202','Fornecedor B',$1) RETURNING id", [ids.oB])).id;
  const src = (await one("SELECT id FROM ata_sources WHERE code='fornecedor'")).id;
  const ata = async (org: string, sup: string, status: string) =>
    (await one("INSERT INTO price_registration_atas(source_id,origin,submitted_by_org_id,supplier_id,ata_number,object,status) VALUES ($1,'fornecedor',$2,$3,'RLS-1','Objeto de teste RLS',$4) RETURNING id", [src, org, sup, status])).id;
  ids.draftB = await ata(ids.oB, ids.sB, "rascunho");
  ids.pubA = await ata(ids.oA, ids.sA, "cadastrada");
  ids.docPriv = (await one("INSERT INTO ata_documents(ata_id,owner_org_id,kind,title,visibility,storage_path) VALUES ($1,$2,'evidencia','priv','private','x/priv.pdf') RETURNING id", [ids.pubA, ids.oA])).id;
  ids.docPubDraft = (await one("INSERT INTO ata_documents(ata_id,owner_org_id,kind,title,visibility,storage_path) VALUES ($1,$2,'ata','pub','public','x/pub.pdf') RETURNING id", [ids.draftB, ids.oB])).id;
});

after(async () => { await db.query("ROLLBACK").catch(() => {}); await db.end(); });

test("anônimo não lê dados privados", async () => {
  await as("anon");
  for (const t of ["users", "organizations", "organization_members", "contact_requests", "subscriptions", "payments", "audit_logs", "sessions", "supplier_claims", "email_outbox"])
    assert.equal(await count(`SELECT count(*) n FROM ${t}`), 0, t);
  assert.equal(await count("SELECT count(*) n FROM price_registration_atas WHERE id = $1", [ids.draftB]), 0, "rascunho alheio");
  assert.equal(await count("SELECT count(*) n FROM price_registration_atas WHERE id = $1", [ids.pubA]), 1, "ata publicada é pública");
  assert.equal(await count("SELECT count(*) n FROM ata_documents WHERE id = ANY($1)", [[ids.docPriv, ids.docPubDraft]]), 0, "documentos privados e de rascunho");
});

test("anônimo não escreve", async () => {
  await as("anon");
  await rejects(() => db.query("INSERT INTO users(email,password_hash,full_name) VALUES ('x@x.invalid','x','x')"), "criar usuário");
  await rejects(() => db.query("INSERT INTO categories(slug,name) VALUES ('hack','hack')"), "criar categoria");
  assert.equal((await db.query("UPDATE price_registration_atas SET object = 'x' WHERE id = $1", [ids.pubA])).rowCount, 0);
});

test("fornecedor A não vê nem altera dados do fornecedor B", async () => {
  await as("user", ids.uA);
  assert.equal(await count("SELECT count(*) n FROM price_registration_atas WHERE id = $1", [ids.draftB]), 0);
  assert.equal((await db.query("UPDATE price_registration_atas SET object = 'invadido' WHERE id = $1", [ids.draftB])).rowCount, 0);
  assert.equal((await db.query("DELETE FROM price_registration_atas WHERE id = $1", [ids.draftB])).rowCount, 0);
  assert.equal(await count("SELECT count(*) n FROM organizations WHERE id = $1", [ids.oB]), 0);
  await rejects(() => db.query("INSERT INTO ata_items(ata_id,description,link_status) VALUES ($1,'x','informado_fornecedor')", [ids.draftB]), "item em ata alheia");
  await rejects(() => db.query("INSERT INTO organization_members(organization_id,user_id) VALUES ($1,$2)", [ids.oB, ids.uA]), "entrar na organização alheia");
});

test("fornecedor não se autopromove nem publica sem moderação", async () => {
  await as("user", ids.uA);
  await rejects(() => db.query("UPDATE price_registration_atas SET status = 'verificada' WHERE id = $1", [ids.pubA]), "status verificada");
  await rejects(() => db.query("UPDATE price_registration_atas SET supplier_confirmed = true WHERE id = $1", [ids.pubA]), "flag de moderação");
  await rejects(() => db.query("UPDATE users SET platform_role = 'admin' WHERE id = $1", [ids.uA]), "virar admin");
  await rejects(() => db.query("UPDATE organizations SET verification_status = 'verified' WHERE id = $1", [ids.oA]), "autoverificação");
  const src = (await one("SELECT id FROM ata_sources WHERE code='fornecedor'")).id;
  await rejects(() => db.query("INSERT INTO price_registration_atas(source_id,origin,submitted_by_org_id,ata_number,object,status) VALUES ($1,'fornecedor',$2,'X','objeto x','verificada')", [src, ids.oA]), "criar ata já verificada");
  await rejects(() => db.query("INSERT INTO price_registration_atas(source_id,origin,submitted_by_org_id,supplier_id,ata_number,object,status) VALUES ($1,'fornecedor',$2,$3,'X','objeto x','rascunho')", [src, ids.oA, ids.sB]), "atribuir ata a outro fornecedor");
  // Editar dados de ata publicada devolve para validação
  await db.query("UPDATE price_registration_atas SET object = 'Objeto corrigido' WHERE id = $1", [ids.pubA]);
  assert.equal((await one("SELECT status FROM price_registration_atas WHERE id = $1", [ids.pubA])).status, "em_validacao");
});

test("solicitações: órgão envia só em nome próprio; cada fornecedor vê só as suas", async () => {
  await as("system");
  await db.query("UPDATE price_registration_atas SET status = 'cadastrada' WHERE id = $1", [ids.pubA]);
  await as("user", ids.uG);
  await rejects(() => db.query(
    "INSERT INTO contact_requests(ata_id,supplier_id,requester_user_id,requester_org_id,message,contact_name,contact_email) VALUES ($1,$2,$3,$4,'m','n','e@e.invalid')",
    [ids.pubA, ids.sA, ids.uG, ids.oA]), "solicitar em nome de outra organização");
  const cr = await one(
    "INSERT INTO contact_requests(ata_id,supplier_id,requester_user_id,requester_org_id,message,contact_name,contact_email) VALUES ($1,$2,$3,$4,'mensagem','n','e@e.invalid') RETURNING id",
    [ids.pubA, ids.sA, ids.uG, ids.oG]);
  await as("user", ids.uA);
  assert.equal(await count("SELECT count(*) n FROM contact_requests WHERE id = $1", [cr.id]), 1, "fornecedor destinatário vê");
  await as("user", ids.uB);
  assert.equal(await count("SELECT count(*) n FROM contact_requests WHERE id = $1", [cr.id]), 0, "outro fornecedor não vê");
});

test("evidências privadas: só dono e administração", async () => {
  await as("user", ids.uB);
  assert.equal(await count("SELECT count(*) n FROM ata_documents WHERE id = $1", [ids.docPriv]), 0);
  await as("user", ids.uA);
  assert.equal(await count("SELECT count(*) n FROM ata_documents WHERE id = $1", [ids.docPriv]), 1);
  await as("admin", ids.uG);
  assert.equal(await count("SELECT count(*) n FROM ata_documents WHERE id = $1", [ids.docPriv]), 1);
});

test("favoritos e pesquisas são pessoais", async () => {
  await as("user", ids.uG);
  await db.query("INSERT INTO favorites(user_id, ata_id) VALUES ($1,$2)", [ids.uG, ids.pubA]);
  await rejects(() => db.query("INSERT INTO favorites(user_id, ata_id) VALUES ($1,$2)", [ids.uA, ids.pubA]), "favorito em nome de outro");
  await as("user", ids.uA);
  assert.equal(await count("SELECT count(*) n FROM favorites WHERE user_id = $1", [ids.uG]), 0);
});
