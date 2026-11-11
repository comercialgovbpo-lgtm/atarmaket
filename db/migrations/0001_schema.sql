-- =====================================================================
-- AtaMarket — Marketplace Nacional de Atas de Registro de Preços
-- Migração 0001: esquema base (PostgreSQL 15+ / Supabase compatível)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Configuração de busca textual em português sem acentos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
    ALTER TEXT SEARCH CONFIGURATION pt_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------
-- Usuários, sessões e organizações
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  full_name         text NOT NULL,
  phone             text,
  platform_role     text NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user','admin')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  email_verified_at timestamptz,
  terms_accepted_at   timestamptz,
  privacy_accepted_at timestamptz,
  marketing_consent boolean NOT NULL DEFAULT false,
  last_login_at     timestamptz,
  failed_logins     int NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id          text PRIMARY KEY,               -- sha256 do token (o token nunca é armazenado)
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_org_id uuid,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE password_reset_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('supplier','government')),
  cnpj          char(14) NOT NULL,
  legal_name    text NOT NULL,
  trade_name    text,
  cnae          text,
  email         citext,
  phone         text,
  address       text,
  city          text,
  state         char(2),
  ibge_code     text,
  -- órgãos públicos
  sphere        text CHECK (sphere IN ('federal','estadual','distrital','municipal')),
  power         text CHECK (power IN ('executivo','legislativo','judiciario','ministerio_publico','tribunal_contas','defensoria','autarquia_fundacao','empresa_estatal','consorcio','outro')),
  responsible_name  text,
  responsible_title text,
  commercial_contact text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verification_notes text,
  verified_at   timestamptz,
  verified_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, cnpj)
);
CREATE TRIGGER trg_org_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  job_title       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX idx_members_user ON organization_members(user_id);

-- ---------------------------------------------------------------------
-- Entidades de mercado (dados públicos)
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj            varchar(14) NOT NULL UNIQUE,     -- CNPJ ou NI (pessoa física é mascarada na exibição)
  person_type     text NOT NULL DEFAULT 'PJ' CHECK (person_type IN ('PJ','PF','ESTRANGEIRO')),
  legal_name      text NOT NULL,
  trade_name      text,
  cnae            text,
  company_size    text,
  city            text,
  state           char(2),
  organization_id uuid UNIQUE REFERENCES organizations(id) ON DELETE SET NULL, -- conta vinculada (titularidade comprovada)
  profile_description text,
  website         text,
  public_email    citext,
  public_phone    text,
  show_contact    boolean NOT NULL DEFAULT false,  -- consentimento para exibir contato
  featured        boolean NOT NULL DEFAULT false,
  first_seen_source text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_suppliers_name_trgm ON suppliers USING gin (f_unaccent(legal_name) gin_trgm_ops);

CREATE TABLE government_entities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj            char(14) NOT NULL UNIQUE,
  name            text NOT NULL,
  sphere          text CHECK (sphere IN ('federal','estadual','distrital','municipal')),
  power           text,
  state           char(2),
  city            text,
  ibge_code       text,
  organization_id uuid UNIQUE REFERENCES organizations(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_gov_updated BEFORE UPDATE ON government_entities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_gov_name_trgm ON government_entities USING gin (f_unaccent(name) gin_trgm_ops);

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  icon        text,
  parent_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  keywords    text[] NOT NULL DEFAULT '{}',
  sort_order  int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ata_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('api','upload','manual','importacao_arquivo')),
  base_url    text,
  docs_url    text,
  active      boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}',
  terms_notes text,
  last_sync_at timestamptz,
  last_sync_cursor text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Contratação de origem (ex.: compra/pregão no PNCP)
CREATE TABLE procurement_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES ata_sources(id),
  external_id        text NOT NULL,
  government_entity_id uuid REFERENCES government_entities(id),
  unit_code          text,
  unit_name          text,
  modality           text,
  procurement_number text,
  process_number     text,
  year               int,
  sequence           int,
  object             text,
  city               text,
  state              char(2),
  ibge_code          text,
  source_url         text,
  items_synced_at    timestamptz,
  raw                jsonb,
  collected_at       timestamptz NOT NULL DEFAULT now(),
  source_updated_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE TRIGGER trg_proc_updated BEFORE UPDATE ON procurement_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Atas de Registro de Preços
-- ---------------------------------------------------------------------
-- Status (seção 5 do escopo) + estados internos de fluxo (rascunho, rejeitada)
CREATE OR REPLACE FUNCTION ata_status_is_public(s text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$
  SELECT s IN ('importada','cadastrada','verificada','fornecedor_confirmado',
               'vigencia_confirmada','disponibilidade_consultada','encerrada') $$;

CREATE TABLE price_registration_atas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid NOT NULL REFERENCES ata_sources(id),
  external_id         text,                      -- ex.: numeroControlePNCPAta
  origin              text NOT NULL CHECK (origin IN ('fonte_publica','fornecedor')),
  procurement_record_id uuid REFERENCES procurement_records(id),
  managing_entity_id  uuid REFERENCES government_entities(id),
  managing_unit_name  text,
  uasg                text,
  supplier_id         uuid REFERENCES suppliers(id),   -- pode ser nulo (fornecedor não confirmado)
  submitted_by_org_id uuid REFERENCES organizations(id),
  ata_number          text NOT NULL,
  year                int,
  process_number      text,
  procurement_reference text,                    -- pregão / procedimento de origem
  modality            text,
  object              text NOT NULL,
  category_id         uuid REFERENCES categories(id),
  category_auto       boolean NOT NULL DEFAULT true,
  city                text,
  state               char(2),
  signature_date      date,
  validity_start      date,
  validity_end        date,
  cancelled           boolean NOT NULL DEFAULT false,
  cancelled_at        timestamptz,
  status              text NOT NULL CHECK (status IN ('rascunho','importada','cadastrada','em_validacao','verificada',
                        'fornecedor_confirmado','vigencia_confirmada','disponibilidade_consultada','encerrada','rejeitada')),
  status_updated_at   timestamptz NOT NULL DEFAULT now(),
  -- flags de conferência independentes do status principal
  documents_verified  boolean NOT NULL DEFAULT false,
  supplier_confirmed  boolean NOT NULL DEFAULT false,
  validity_confirmed  boolean NOT NULL DEFAULT false,
  availability_checked_at timestamptz,
  availability_note   text,
  source_reported_adhesion boolean,             -- campo "possibilidadeAdesao" informado pela fonte (não é autorização)
  source_url          text,
  original_document_url text,
  collected_at        timestamptz,
  source_updated_at   timestamptz,
  last_synced_at      timestamptz,
  content_hash        text,
  duplicate_of        uuid REFERENCES price_registration_atas(id),
  raw                 jsonb,
  moderation_notes    text,
  featured            boolean NOT NULL DEFAULT false,
  views_count         int NOT NULL DEFAULT 0,
  search_tsv          tsvector,
  published_at        timestamptz,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ata_source_external ON price_registration_atas(source_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_ata_status ON price_registration_atas(status);
CREATE INDEX idx_ata_validity ON price_registration_atas(validity_end);
CREATE INDEX idx_ata_state_city ON price_registration_atas(state, city);
CREATE INDEX idx_ata_supplier ON price_registration_atas(supplier_id);
CREATE INDEX idx_ata_manager ON price_registration_atas(managing_entity_id);
CREATE INDEX idx_ata_category ON price_registration_atas(category_id);
CREATE INDEX idx_ata_submitted ON price_registration_atas(submitted_by_org_id);
CREATE INDEX idx_ata_proc ON price_registration_atas(procurement_record_id);
CREATE INDEX idx_ata_created ON price_registration_atas(created_at DESC);
CREATE INDEX idx_ata_tsv ON price_registration_atas USING gin(search_tsv);
CREATE TRIGGER trg_ata_updated BEFORE UPDATE ON price_registration_atas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION ata_tsv_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
      setweight(to_tsvector('pt_unaccent', coalesce(NEW.ata_number,'')), 'A') ||
      setweight(to_tsvector('pt_unaccent', coalesce(NEW.object,'')), 'B') ||
      setweight(to_tsvector('pt_unaccent', coalesce(NEW.managing_unit_name,'') || ' ' || coalesce(NEW.procurement_reference,'')), 'C');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ata_tsv BEFORE INSERT OR UPDATE OF ata_number, object, managing_unit_name, procurement_reference
  ON price_registration_atas FOR EACH ROW EXECUTE FUNCTION ata_tsv_refresh();

CREATE TABLE ata_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id            uuid REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  procurement_record_id uuid REFERENCES procurement_records(id) ON DELETE CASCADE,
  item_number       int,
  catalog_type      text CHECK (catalog_type IN ('CATMAT','CATSER','OUTRO')),
  catalog_code      text,
  material_or_service char(1) CHECK (material_or_service IN ('M','S')),
  description       text NOT NULL,
  unit              text,
  quantity          numeric(18,4),
  unit_price        numeric(18,4),
  total_price       numeric(18,2),
  supplier_id       uuid REFERENCES suppliers(id),
  supplier_ni       varchar(14),
  supplier_name     text,
  -- vínculo item ↔ ata: a API pública nem sempre informa
  link_status       text NOT NULL DEFAULT 'nao_vinculado' CHECK (link_status IN ('informado_fornecedor','vinculo_unico_fonte','nao_vinculado')),
  external_ref      text,
  raw               jsonb,
  search_tsv        tsvector,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ata_id IS NOT NULL OR procurement_record_id IS NOT NULL)
);
CREATE INDEX idx_items_ata ON ata_items(ata_id);
CREATE INDEX idx_items_proc ON ata_items(procurement_record_id);
CREATE INDEX idx_items_catalog ON ata_items(catalog_code);
CREATE INDEX idx_items_supplier_ni ON ata_items(supplier_ni);
CREATE INDEX idx_items_price ON ata_items(unit_price);
CREATE INDEX idx_items_tsv ON ata_items USING gin(search_tsv);
CREATE UNIQUE INDEX uq_items_external ON ata_items(procurement_record_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON ata_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION item_tsv_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := setweight(to_tsvector('pt_unaccent', coalesce(NEW.description,'')), 'A')
                 || setweight(to_tsvector('simple', coalesce(NEW.catalog_code,'')), 'A');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_items_tsv BEFORE INSERT OR UPDATE OF description, catalog_code ON ata_items
  FOR EACH ROW EXECUTE FUNCTION item_tsv_refresh();

CREATE TABLE ata_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id        uuid REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  procurement_record_id uuid REFERENCES procurement_records(id) ON DELETE CASCADE,
  owner_org_id  uuid REFERENCES organizations(id),
  kind          text NOT NULL CHECK (kind IN ('ata','edital','termo_aditivo','evidencia','outro')),
  title         text NOT NULL,
  visibility    text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  storage_path  text,
  external_url  text,
  mime_type     text,
  size_bytes    bigint,
  sha256        text,
  published_at_source timestamptz,
  uploaded_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);
CREATE INDEX idx_docs_ata ON ata_documents(ata_id);
CREATE INDEX idx_docs_proc ON ata_documents(procurement_record_id);
CREATE UNIQUE INDEX uq_docs_external ON ata_documents(coalesce(ata_id, procurement_record_id), external_url) WHERE external_url IS NOT NULL;

CREATE TABLE ata_status_history (
  id          bigserial PRIMARY KEY,
  ata_id      uuid NOT NULL REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES users(id),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_hist_ata ON ata_status_history(ata_id);

-- Histórico de alterações de dados (rastreabilidade)
CREATE TABLE ata_change_log (
  id          bigserial PRIMARY KEY,
  ata_id      uuid NOT NULL REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  origin      text NOT NULL CHECK (origin IN ('sincronizacao','fornecedor','administrador')),
  changed_by  uuid REFERENCES users(id),
  changes     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_log_ata ON ata_change_log(ata_id);

-- Análise de potencial de adesão (registro de critérios e ressalvas)
CREATE TABLE ata_adhesion_assessments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id      uuid NOT NULL REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  assessed_by uuid REFERENCES users(id),
  scope       text NOT NULL DEFAULT 'plataforma' CHECK (scope IN ('plataforma','orgao')),
  organization_id uuid REFERENCES organizations(id),
  criteria    jsonb NOT NULL,
  conclusion  text NOT NULL CHECK (conclusion IN ('sem_impedimento_aparente','requer_analise_adicional','impedimento_identificado')),
  caveats     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assess_ata ON ata_adhesion_assessments(ata_id);

-- Extrações automáticas de documentos (IA / heurística) — nunca publicadas sem revisão
CREATE TABLE ata_extractions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  document_id   uuid REFERENCES ata_documents(id) ON DELETE SET NULL,
  ata_id        uuid REFERENCES price_registration_atas(id) ON DELETE SET NULL,
  method        text NOT NULL CHECK (method IN ('llm','heuristica')),
  model         text,
  status        text NOT NULL CHECK (status IN ('processando','concluida','falhou','revisada')),
  text_chars    int,
  result        jsonb,
  warnings      jsonb,
  error         text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

CREATE TABLE supplier_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid NOT NULL REFERENCES suppliers(id),
  ata_id          uuid REFERENCES price_registration_atas(id),
  claimant_org_id uuid NOT NULL REFERENCES organizations(id),
  claimant_user_id uuid NOT NULL REFERENCES users(id),
  relationship    text NOT NULL CHECK (relationship IN ('titular','representante_comercial')),
  justification   text NOT NULL,
  evidence_document_ids uuid[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada')),
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_claims_status ON supplier_claims(status);

-- ---------------------------------------------------------------------
-- Ferramentas do comprador
-- ---------------------------------------------------------------------
CREATE TABLE favorites (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ata_id     uuid NOT NULL REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  note       text,
  stage      text NOT NULL DEFAULT 'salva' CHECK (stage IN ('salva','em_analise','consulta_enviada','descartada','encaminhada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ata_id)
);

CREATE TABLE saved_searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  name        text NOT NULL,
  query       jsonb NOT NULL,
  last_run_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_user ON saved_searches(user_id);

CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('novas_atas_pesquisa','vencimento_ata','vencimento_minhas_atas')),
  saved_search_id uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
  ata_id        uuid REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  days_before   int NOT NULL DEFAULT 30,
  active        boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_user ON alerts(user_id);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text,
  link       text,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE search_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  query       jsonb NOT NULL,
  results_count int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_logs_created ON search_logs(created_at);
CREATE INDEX idx_search_logs_user ON search_logs(user_id, created_at DESC);

CREATE TABLE ata_view_events (
  id         bigserial PRIMARY KEY,
  ata_id     uuid NOT NULL REFERENCES price_registration_atas(id) ON DELETE CASCADE,
  viewer_kind text NOT NULL DEFAULT 'anonimo' CHECK (viewer_kind IN ('anonimo','orgao','fornecedor','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_views_ata ON ata_view_events(ata_id, created_at);

-- ---------------------------------------------------------------------
-- Conexão comercial
-- ---------------------------------------------------------------------
CREATE TABLE contact_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id            uuid NOT NULL REFERENCES price_registration_atas(id),
  ata_item_id       uuid REFERENCES ata_items(id),
  supplier_id       uuid REFERENCES suppliers(id),
  requester_user_id uuid NOT NULL REFERENCES users(id),
  requester_org_id  uuid NOT NULL REFERENCES organizations(id),
  kind              text NOT NULL DEFAULT 'informacoes' CHECK (kind IN ('informacoes','interesse_comercial')),
  intended_quantity numeric(18,4),
  message           text NOT NULL,
  contact_name      text NOT NULL,
  contact_email     citext NOT NULL,
  contact_phone     text,
  status            text NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada','aguardando_fornecedor','visualizada','respondida','encerrada')),
  supplier_response text,
  responded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_supplier ON contact_requests(supplier_id);
CREATE INDEX idx_contact_requester ON contact_requests(requester_org_id);
CREATE TRIGGER trg_contact_updated BEFORE UPDATE ON contact_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE commercial_opportunities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_request_id uuid UNIQUE REFERENCES contact_requests(id) ON DELETE SET NULL,
  ata_id          uuid REFERENCES price_registration_atas(id) ON DELETE SET NULL,
  title           text NOT NULL,
  government_name text NOT NULL,
  government_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  contact_name    text,
  contact_email   citext,
  contact_phone   text,
  status          text NOT NULL DEFAULT 'novo_interessado' CHECK (status IN ('novo_interessado','contato_iniciado','em_negociacao',
                    'aguardando_documentacao','adesao_em_analise','convertido','perdido')),
  estimated_value numeric(18,2),
  last_contact_at date,
  next_action_at  date,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_org ON commercial_opportunities(supplier_org_id, status);
CREATE TRIGGER trg_opp_updated BEFORE UPDATE ON commercial_opportunities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE opportunity_events (
  id             bigserial PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES commercial_opportunities(id) ON DELETE CASCADE,
  author_id      uuid REFERENCES users(id),
  kind           text NOT NULL CHECK (kind IN ('nota','mudanca_status','contato')),
  from_status    text,
  to_status      text,
  note           text,
  occurred_at    date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_events ON opportunity_events(opportunity_id);

-- ---------------------------------------------------------------------
-- Planos, assinaturas e pagamentos (agnóstico de provedor)
-- ---------------------------------------------------------------------
CREATE TABLE subscription_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  audience      text NOT NULL CHECK (audience IN ('supplier','government')),
  name          text NOT NULL,
  description   text,
  price_cents   int NOT NULL CHECK (price_cents >= 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month','year')),
  ata_limit     int,
  user_limit    int,
  features      jsonb NOT NULL DEFAULT '{}',
  highlights    text[] NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES subscription_plans(id),
  status          text NOT NULL CHECK (status IN ('aguardando_pagamento','ativa','inadimplente','cancelada','expirada','aguardando_contratacao')),
  price_cents     int NOT NULL,
  started_at      timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  canceled_at     timestamptz,
  provider        text,
  provider_customer_id text,
  provider_subscription_id text,
  contract_reference text,          -- órgãos: nº processo / contrato / nota de empenho
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_org ON subscriptions(organization_id, status);
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  amount_cents    int NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'BRL',
  status          text NOT NULL CHECK (status IN ('pendente','pago','falhou','estornado','cancelado')),
  provider        text NOT NULL,
  provider_payment_id text,
  checkout_url    text,
  method          text,
  due_date        date,
  paid_at         timestamptz,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE TRIGGER trg_pay_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Auditoria, sincronização, LGPD e e-mail
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role   text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE synchronization_logs (
  id          bigserial PRIMARY KEY,
  source_id   uuid NOT NULL REFERENCES ata_sources(id),
  job         text NOT NULL,
  status      text NOT NULL CHECK (status IN ('executando','sucesso','parcial','falhou')),
  params      jsonb NOT NULL DEFAULT '{}',
  fetched     int NOT NULL DEFAULT 0,
  created     int NOT NULL DEFAULT 0,
  updated     int NOT NULL DEFAULT 0,
  unchanged   int NOT NULL DEFAULT 0,
  expired     int NOT NULL DEFAULT 0,
  duplicates  int NOT NULL DEFAULT 0,
  errors      int NOT NULL DEFAULT 0,
  error_details jsonb NOT NULL DEFAULT '[]',
  triggered_by text NOT NULL DEFAULT 'agendamento',
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_sync_started ON synchronization_logs(started_at DESC);

CREATE TABLE data_subject_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  email       citext NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('acesso','correcao','exclusao','portabilidade','revogacao_consentimento')),
  details     text,
  status      text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_atendimento','concluida','indeferida')),
  response    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE email_outbox (
  id         bigserial PRIMARY KEY,
  to_email   citext NOT NULL,
  subject    text NOT NULL,
  body_text  text NOT NULL,
  status     text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','falhou')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
