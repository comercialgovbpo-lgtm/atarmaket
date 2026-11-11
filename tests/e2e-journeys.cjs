// E2E das 3 jornadas. Executar: node journeys.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const B = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const DIR = process.env.E2E_DIR ?? require("os").tmpdir();
function cnpj() {
  const b = String(10000000 + Math.floor(Math.random() * 89999999)) + "0001";
  const dv = (n, w) => { const r = n.split("").reduce((a, c, i) => a + Number(c) * w[i], 0) % 11; return r < 2 ? "0" : String(11 - r); };
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return b + d1 + dv(b + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}
const SUP = cnpj(), GOV = cnpj();
const stamp = Date.now();
const supEmail = `fornecedor.e2e.${stamp}@teste.invalid`;
const govEmail = `compras.e2e.${stamp}@teste.gov.br`;
const PW = "SenhaTeste2026x";
if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) throw new Error("Defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD");
const shot = async (page, name) => page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
const ok = (cond, msg) => { if (!cond) throw new Error("FALHA: " + msg); console.log("✓", msg); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = async () => { const c = await browser.newContext({ viewport: { width: 1360, height: 900 } }); c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message))); return c; };

  // ---------------- Jornada 1: fornecedor
  const sc = await ctx(); const s = await sc.newPage();
  await s.goto(B + "/"); await shot(s, "01-home");
  await s.click("text=Cadastrar minha empresa");
  await s.fill("input[name=cnpj]", SUP);
  await s.fill("input[name=legal_name]", "EMPRESA TESTE E2E LTDA");
  await s.fill("input[name=email]", supEmail); await s.fill("input[name=phone]", "11999990000");
  await s.fill("input[name=city]", "São Paulo"); await s.selectOption("select[name=state]", "SP");
  await s.fill("input[name=full_name]", "Responsável Teste"); await s.fill("input[name=commercial_contact]", "Comercial Teste");
  await s.fill("input[name=password]", PW); await s.check("input[name=accept_terms]");
  await s.click("button:has-text('Criar conta da empresa')"); await s.waitForURL(/fornecedor\/assinatura/);
  ok(await s.isVisible("text=Conta criada"), "fornecedor cadastrado e direcionado à escolha de plano");
  await s.locator("form:has(button:has-text('Solicitar contratação'))").nth(1).locator("button").click();
  await s.waitForURL(/solicitado=1/); ok(await s.isVisible("text=Solicitação registrada"), "plano Profissional solicitado (sem gateway: sem simulação)");

  // ---------------- Admin ativa assinatura
  const ac = await ctx(); const a = await ac.newPage();
  await a.goto(B + "/entrar"); await a.fill("input[name=email]", process.env.E2E_ADMIN_EMAIL); await a.fill("input[name=password]", process.env.E2E_ADMIN_PASSWORD);
  await Promise.all([a.waitForURL(/\/admin/), a.click("button:has-text('Entrar')")]);
  await shot(a, "02-admin-indicadores");
  await a.goto(B + "/admin/assinaturas");
  const row = a.locator("tr", { hasText: "EMPRESA TESTE E2E LTDA" }).first();
  await row.locator("input[name=reference]").fill("PIX-E2E-1");
  await row.locator("button:has-text('Ativar')").click();
  await a.waitForSelector("text=Pagamento registrado");
  ok(true, "admin registrou pagamento manual e ativou o plano");

  // ---------------- Fornecedor envia PDF
  await s.goto(B + "/fornecedor/atas/nova");
  await s.setInputFiles("input[type=file][name=file]", path.join(__dirname, "fixtures-ata-teste.pdf"));
  await Promise.all([s.waitForURL(/extraida=1/, { timeout: 60000 }), s.click("button:has-text('Enviar e extrair dados')")]);
  ok(await s.inputValue("input[name=ata_number]") === "045/2026", "extração preencheu o número da ata");
  ok((await s.locator("tbody tr").count()) >= 2, "extração preencheu os itens");
  await shot(s, "03-fornecedor-revisao-extracao");
  await s.selectOption("select[name=manager_sphere]", "municipal");
  await s.selectOption("form:has(input[name=ata_number]) select[name=state]", "SP");
  await s.fill("form:has(input[name=ata_number]) input[name=city]", "Campinas");
  await s.click("button:has-text('Salvar alterações')"); await s.waitForSelector("text=Dados salvos");
  ok(true, "fornecedor revisou e salvou os dados");
  await s.check("input[name=reviewed]");
  await s.click("button:has-text('Enviar para validação')"); await s.waitForSelector("span:has-text('Em validação')");
  ok(true, "ata enviada para validação");
  const ataUrl = s.url(); const ataId = ataUrl.split("/atas/")[1].split("?")[0];

  // ---------------- Admin modera e aprova reivindicação
  await a.goto(B + "/admin/atas?fila=1"); ok(await a.isVisible("text=045/2026"), "ata aparece na fila de moderação");
  await a.goto(B + `/admin/atas/${ataId}`);
  await a.selectOption("select[name=status]", "verificada"); await a.check("input[name=documents_verified]"); await a.check("input[name=validity_confirmed]");
  await a.fill("textarea[name=reason]", "Dados conferidos com o documento (teste E2E)");
  await a.click("button:has-text('Salvar moderação')"); await a.waitForSelector("text=Moderação registrada");
  ok(true, "admin verificou e publicou a ata");
  await shot(a, "04-admin-moderacao");
  await a.goto(B + "/admin/reivindicacoes");
  const claim = a.locator("div.rounded-xl", { hasText: "EMPRESA TESTE E2E LTDA" }).first();
  await claim.locator("input[name=notes]").fill("Titularidade conferida (teste)");
  await claim.locator("button:has-text('Aprovar')").click(); await a.waitForTimeout(800);
  ok(true, "admin aprovou a titularidade do fornecedor");

  // ---------------- Jornada 2: órgão público
  const gc = await ctx(); const g = await gc.newPage();
  await g.goto(B + "/cadastro/orgao");
  await g.fill("input[name=cnpj]", GOV); await g.selectOption("select[name=sphere]", "estadual");
  await g.fill("input[name=legal_name]", "ÓRGÃO DE TESTE E2E"); await g.selectOption("select[name=power]", "executivo");
  await g.selectOption("select[name=state]", "SP"); await g.fill("input[name=city]", "São Paulo");
  await g.fill("input[name=full_name]", "Comprador Teste"); await g.fill("input[name=responsible_title]", "Pregoeiro");
  await g.fill("input[name=email]", govEmail); await g.fill("input[name=phone]", "1133330000"); await g.fill("input[name=password]", PW);
  await g.check("input[name=accept_terms]");
  await Promise.all([g.waitForURL(/\/orgao\?bemvindo/), g.click("button:has-text('Criar acesso institucional')")]);
  ok(await g.isVisible("text=Avaliação institucional"), "órgão cadastrado com período de avaliação");
  await g.goto(B + "/atas?q=notebook");
  ok(await g.isVisible("text=Ata nº 045/2026"), "busca encontra a ata publicada");
  await shot(g, "05-busca");
  await g.goto(B + "/atas?q=notebook&uf=SP&precoMax=5000&ordem=preco"); ok(await g.isVisible("text=menor preço não representa"), "filtros combinados + aviso sobre menor preço");
  await g.goto(B + `/atas/${ataId}`);
  ok(await g.isVisible("text=não representa autorização automática para adesão"), "aviso jurídico exibido na ata");
  await g.click("button:has-text('Favoritar')"); await g.waitForSelector("button:has-text('Favoritada')");
  ok(true, "ata favoritada");
  await g.goto(B + `/atas/${ataId}?item=&qtd=`);
  const firstItem = await g.locator("select[name=item] option").nth(1).getAttribute("value");
  await g.goto(B + `/atas/${ataId}?item=${firstItem}&qtd=80#adesao`);
  ok(await g.isVisible("text=Quantidade acima do limite individual"), "alerta do art. 86 §4º (80 de 100 > 50%)");
  await shot(g, "06-ata-detalhe");
  await g.selectOption("select[name=ata_item_id]", firstItem);
  await g.fill("input[name=intended_quantity]", "40");
  await g.fill("textarea[name=message]", "Gostaríamos de confirmar disponibilidade e prazo de entrega para 40 unidades.");
  await g.check("input[name=ack]");
  await Promise.all([g.waitForURL(/enviado=1/), g.click("button:has-text('Enviar solicitação')")]);
  ok(true, "solicitação de informações enviada");
  const other = await g.evaluate(async () => (await (await fetch("/api/v1/atas?q=computador")).json()).dados.map((d) => d.id));
  await g.goto(B + `/orgao/comparar?ids=${[ataId, ...other.slice(0, 2)].join(",")}`);
  ok((await g.locator("thead th").count()) >= 3, "comparador lado a lado");
  await shot(g, "07-comparador");

  // ---------------- Fornecedor responde; CRM
  await s.goto(B + "/fornecedor/solicitacoes");
  ok(await s.isVisible("text=ÓRGÃO DE TESTE E2E"), "fornecedor recebeu a solicitação");
  await s.fill("textarea[name=response]", "Temos disponibilidade. A adesão depende da autorização do órgão gerenciador.");
  await s.click("button:has-text('Enviar resposta')"); await s.waitForSelector("text=Sua resposta");
  await s.goto(B + "/fornecedor/oportunidades"); ok(await s.isVisible("text=ÓRGÃO DE TESTE E2E"), "oportunidade criada no CRM (contato iniciado)");
  await shot(s, "08-crm");
  await s.goto(B + "/fornecedor"); await shot(s, "09-fornecedor-dashboard");
  await g.goto(B + "/orgao/solicitacoes"); ok(await g.isVisible("text=Temos disponibilidade"), "órgão vê a resposta do fornecedor");
  await g.goto(B + "/orgao"); await shot(g, "10-orgao-dashboard");

  // ---------------- Segurança básica
  const anon = await (await ctx()).newPage();
  const r1 = await anon.goto(B + "/admin"); ok(anon.url().includes("/entrar"), "admin protegido para anônimo");
  const r2 = await anon.goto(B + `/fornecedor/atas/${ataId}`); ok(anon.url().includes("/entrar"), "painel do fornecedor protegido");
  await g.goto(B + "/admin"); ok(!g.url().includes("/admin"), "órgão não acessa admin");
  ok(errors.length === 0, "sem erros de JavaScript no navegador " + errors.join("; "));
  fs.writeFileSync(path.join(DIR, "result.json"), JSON.stringify({ ataId, supEmail, govEmail }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
