# AtaMarket — Marketplace Nacional de Atas de Registro de Preços

Plataforma SaaS que conecta **fornecedores com atas vigentes** a **órgãos públicos** interessados em aderir como não participantes (“carona”), com dados públicos importados do **PNCP** e atas cadastradas pelas próprias empresas.

> A plataforma é um ambiente de **descoberta, exposição e conexão comercial**. Não autoriza adesões, não confirma saldo e não substitui a instrução processual do órgão (Lei 14.133/2021, art. 86).

## Stack

| Camada | Escolha |
|---|---|
| Frontend / Backend | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, componentes próprios acessíveis (`src/components/ui.tsx`), ícones lucide |
| Banco | PostgreSQL 15+ (compatível com Supabase), SQL puro via `pg`, migrações em `db/migrations` |
| Segurança de dados | Row Level Security em todas as tabelas; app conecta com papel **sem BYPASSRLS** |
| Autenticação | Sessões próprias (cookie HttpOnly, token com hash SHA-256 no banco, bcrypt) — equivalente ao Supabase Auth, sem dependência de provedor |
| Arquivos | Driver `local` ou Supabase Storage (bucket privado); download só via `/api/documentos/[id]` com checagem RLS |
| Extração de PDFs | `unpdf` (texto) → Claude (`@anthropic-ai/sdk`, saída estruturada; PDFs digitalizados enviados como documento = OCR) → fallback heurístico |
| Pagamentos | Camada agnóstica (`src/lib/payments`) com adaptadores Stripe e Mercado Pago; registro manual (PIX/boleto/empenho) |
| Deploy | Vercel + Supabase (ou qualquer Node 20+ com PostgreSQL); `vercel.json` com crons |

## Como rodar localmente

```bash
npm install
```

```bash
npm run db:setup-local   # cria banco, papel proprietário e papel da aplicação (requer PostgreSQL local)
```

```bash
cp .env.example .env.local   # ajuste as URLs impressas pelo passo anterior
```

```bash
set -a; . ./.env.local; set +a; npm run db:migrate
```

```bash
ADMIN_EMAIL=voce@empresa.com.br ADMIN_PASSWORD='senha-forte-123' npm run create-admin
```

```bash
npm run sync:pncp -- --mode=vigencia --pages=5      # importa atas reais do PNCP
```

```bash
npm run dev
```

Em ambientes com proxy HTTP, o `fetch` do Node precisa de `NODE_USE_ENV_PROXY=1`.

### Supabase

1. Rode as migrações com a connection string do papel `postgres` (proprietário).
2. Crie um papel de login para a aplicação e conceda `app_runtime` (`GRANT app_runtime TO atamarket_app;`). **Não use** `service_role`/`postgres` em `DATABASE_URL`, pois ignoram RLS.
3. Crie um bucket **privado** `ata-documents` e configure `STORAGE_DRIVER=supabase`.

## Módulos

| Módulo | Rotas |
|---|---|
| A — Portal público | `/`, `/atas` (busca com 13 filtros combináveis), `/atas/[id]`, `/fornecedores/[id]`, `/orgaos/[id]` (órgão gerenciador), `/planos`, `/sobre-os-dados`, `/api/v1/atas` (API pública JSON) |
| B — Fornecedor | `/fornecedor` (dashboard), `/atas`, `/atas/nova` (upload PDF + extração ou manual), `/atas/[id]` (revisão, itens, documentos, envio para validação), `/solicitacoes`, `/oportunidades` (CRM em 7 etapas), `/relatorios` (Enterprise: visualizações, origem, funil, desempenho por ata), `/perfil`, `/reivindicar`, `/assinatura` |
| C — Órgão público | `/orgao` (dashboard), `/favoritos` (etapas + análise de adesão), `/comparar` (até 5 atas, exportação CSV), `/pesquisas` (salvas + histórico), `/alertas`, `/relatorios` (referência de preços por unidade: mín., quartis, mediana, máx., média + CSV, apoio ao art. 23), `/solicitacoes`, `/licenca` |
| D — Administração | `/admin` (KPIs, MRR/ARR, conversão, gráficos por período), moderação, documentos, reivindicações, organizações, usuários, assinaturas/pagamentos, planos, categorias, fontes, auditoria, LGPD |
| E — Dados | `src/lib/sync` (cliente e sincronizador PNCP), `/api/cron/sync`, `/api/cron/alertas`, `synchronization_logs`, `ata_change_log` |

## Motor de dados (PNCP)

Endpoints usados (verificados em 11/2026): `/api/consulta/v1/atas/atualizacao`, `/api/consulta/v1/atas` (vigência), `/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}`, e da API PNCP `.../atas`, `.../itens`, `.../itens/{n}/resultados`, `.../atas/{seq}/arquivos`, `.../arquivos`.

- **Idempotente**: hash de conteúdo; só atualiza o que mudou e grava o diff em `ata_change_log`.
- **Nada é apagado**: atas vencidas/canceladas viram `encerrada` (com histórico); prorrogação reabre.
- **Duplicidade**: ata importada com mesmo órgão + número de uma ata de fornecedor gera alerta para moderação.
- **Limitação da fonte**: a API não informa a qual ata pertence cada item quando uma contratação gera várias atas. Nesse caso os itens aparecem como “da contratação de origem”, com aviso; com ata única, o vínculo é automático e rotulado.
- Pessoa física fornecedora: CPF não é armazenado nem exibido.
- **Desempenho**: requisições paralelas com taxa global controlada (`request_interval_ms`, padrão 250 ms ≈ 4 req/s, e `concurrency` na configuração da fonte). Medido: ≈1,3 s por ata (metadados) e ≈6 s por contratação (itens e resultados).
- **Carga histórica em duas fases, retomável**:
  - fase 1 (metadados): `npm run sync:pncp -- --mode=vigencia --pages=20 --batches=100 --resume --items=0`
  - fase 2 (itens/preços, prioriza vigentes): `npm run sync:pncp -- --mode=itens --limit=50 --batches=200` (também disponível em `/admin/fontes`)
- Outras fontes: tabela `ata_sources` (tipos `api`, `upload`, `importacao_arquivo`) — basta um novo conector seguindo `pncp-sync.ts`.

## Status de validação

`importada` · `cadastrada` · `em_validacao` · `verificada` · `fornecedor_confirmado` · `vigencia_confirmada` · `disponibilidade_consultada` · `encerrada` (+ internos `rascunho` e `rejeitada`). Flags independentes (`documents_verified`, `supplier_confirmed`, `validity_confirmed`, `availability_checked_at`) permitem combinar conferências. Um gatilho no banco impede que usuários não administradores promovam o status.

## Conformidade (art. 86, Lei 14.133/2021 e Lei 14.770/2023)

`src/lib/atas/compliance.ts` gera indicadores: vigência, cancelamento, previsão de adesão informada na fonte, vedação a órgãos federais (§8º), gerenciador municipal (§3º, Lei 14.770/2023), limite individual de 50% (§4º) com simulação por item, limite global do dobro (§5º) e **saldo nunca confirmado**. Checklist de instrução processual e registro de análise (plataforma e órgão) em `ata_adhesion_assessments`. O aviso jurídico obrigatório aparece em todas as páginas de ata.

## Segurança e LGPD

- RLS em todas as tabelas, contexto por transação (`app.user_id`, `app.role`); visão `public_suppliers` expõe contato só com consentimento.
- Consultas 100% parametrizadas; validação com Zod; saída escapada pelo React; CSV com proteção contra injeção de fórmulas.
- Rate limiting (proxy + por ação: login, cadastro, contato, extração), bloqueio após 8 falhas de login, verificação de origem em requisições mutáveis, CSP e cabeçalhos de segurança.
- Auditoria (`audit_logs`) de login, cadastro, moderação, pagamentos, LGPD etc.
- Titular: exportação JSON, exclusão com anonimização, solicitações em `/lgpd` tratadas em `/admin/lgpd`.
- O limitador em memória vale por instância: em produção com várias instâncias, troque o store por Redis/Upstash.

## Pagamentos

Sem gateway configurado, a assinatura fica `aguardando_pagamento` e o administrador registra o pagamento recebido (PIX, boleto, transferência, empenho). Com `PAYMENT_PROVIDER=stripe|mercadopago`, o checkout é criado no provedor e o webhook `/api/webhooks/pagamentos/{provider}` (assinatura HMAC validada, idempotente) ativa/renova o plano. Licenças de órgãos geram pedido `aguardando_contratacao`, ativado após o procedimento administrativo do órgão.

## Testes

```bash
npm test                 # unitários: CNPJ, números, art. 86, categorização, extração, PNCP
```

```bash
npm run test:rls         # isolamento RLS com o papel da aplicação (transação desfeita ao final)
```

```bash
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node tests/e2e-journeys.cjs   # E2E das 3 jornadas (servidor rodando, admin criado, Playwright instalado)
```

```bash
psql "$DATABASE_ADMIN_URL" -f scripts/cleanup-test-data.sql   # remove dados criados pelo E2E (somente desenvolvimento)
```

## Servidor próprio (sem Vercel)

`scripts/serve-local.sh` mantém `next start` rodando (reinicia em caso de queda) e chama as rotinas agendadas (`/api/cron/sync` a cada 3 h, `/api/cron/alertas` diariamente). Logs em `./logs`.

O E2E cria dados de teste (empresa e órgão fictícios com CNPJs gerados) — use em banco de desenvolvimento.

## Pendências para produção

- Revisão jurídica dos Termos, Política de Privacidade e textos de conformidade; nomear o encarregado (DPO).
- Configurar `ANTHROPIC_API_KEY` para extração completa e OCR; gateway de pagamento; provedor de e-mail.
- Verificação de CNPJ/representação por serviço oficial (ex.: consulta à Receita) — hoje validação de dígitos + análise humana com evidências.
- Backfill histórico do PNCP (mais de 500 mil atas): rodar `sync:pncp --mode=vigencia` em lotes (`--start`, `--pages`).

## Restaurar a base de demonstração (dados públicos do PNCP)

Com o banco criado por `npm run db:setup-local` (vazio, sem migrações aplicadas):

```bash
pg_restore --no-owner --role=atamarket_owner -d "$DATABASE_ADMIN_URL" atamarket-db.dump
```

```bash
psql "$DATABASE_ADMIN_URL" -c "GRANT USAGE ON SCHEMA public TO app_runtime; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_runtime; REVOKE ALL ON schema_migrations FROM app_runtime;"
```

Avisos `must be owner of extension` (comentários de extensões) podem ser ignorados. Depois crie o seu administrador com `npm run create-admin` (o dump contém apenas o administrador de desenvolvimento).
