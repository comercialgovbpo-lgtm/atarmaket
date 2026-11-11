-- =====================================================================
-- Migração 0002: contexto de segurança, Row Level Security e permissões
-- A aplicação conecta-se com um papel SEM BYPASSRLS (membro de app_runtime).
-- Cada transação define app.user_id e app.role via set_config(..., true).
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), 'anon') $$;
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_role() = 'system' $$;
CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_role() IN ('admin','system') $$;

-- Funções SECURITY DEFINER evitam recursão de políticas
CREATE OR REPLACE FUNCTION app_org_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM organization_members WHERE user_id = app_uid() $$;

CREATE OR REPLACE FUNCTION app_org_admin_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM organization_members WHERE user_id = app_uid() AND role IN ('owner','admin') $$;

CREATE OR REPLACE FUNCTION app_supplier_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM suppliers s JOIN organization_members m ON m.organization_id = s.organization_id
  WHERE m.user_id = app_uid() $$;

-- Fornecedor declarado pelo CNPJ da organização do usuário (ainda não necessariamente comprovado)
CREATE OR REPLACE FUNCTION app_declared_supplier_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM suppliers s JOIN organizations o ON o.cnpj = s.cnpj AND o.kind = 'supplier'
  WHERE o.id IN (SELECT app_org_ids()) $$;

CREATE OR REPLACE FUNCTION app_can_edit_ata(p_ata uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_is_admin() OR EXISTS (
    SELECT 1 FROM price_registration_atas a
    WHERE a.id = p_ata AND (
      a.submitted_by_org_id IN (SELECT app_org_ids())
      OR a.supplier_id IN (SELECT app_supplier_ids())
    )) $$;

CREATE OR REPLACE FUNCTION app_can_view_ata(p_ata uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_can_edit_ata(p_ata) OR EXISTS (
    SELECT 1 FROM price_registration_atas a WHERE a.id = p_ata AND ata_status_is_public(a.status)) $$;

-- Usuários não-administradores só podem mover o status para rascunho/em_validacao/encerrada
CREATE OR REPLACE FUNCTION guard_ata_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho','em_validacao') THEN
      RAISE EXCEPTION 'Status inicial não permitido: %', NEW.status USING ERRCODE = '42501';
    END IF;
    IF NEW.origin <> 'fornecedor' THEN
      RAISE EXCEPTION 'Origem não permitida' USING ERRCODE = '42501';
    END IF;
    NEW.documents_verified := false; NEW.supplier_confirmed := false; NEW.validity_confirmed := false;
    NEW.featured := false;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('rascunho','em_validacao','encerrada') THEN
    RAISE EXCEPTION 'Alteração de status restrita à moderação: %', NEW.status USING ERRCODE = '42501';
  END IF;
  IF NEW.documents_verified IS DISTINCT FROM OLD.documents_verified
     OR NEW.supplier_confirmed IS DISTINCT FROM OLD.supplier_confirmed
     OR NEW.validity_confirmed IS DISTINCT FROM OLD.validity_confirmed
     OR NEW.featured IS DISTINCT FROM OLD.featured
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id AND OLD.supplier_id IS NOT NULL
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'Campo restrito à moderação' USING ERRCODE = '42501';
  END IF;
  -- Edição de dados de ata pública devolve para validação
  IF OLD.status NOT IN ('rascunho','em_validacao','rejeitada') AND NEW.status = OLD.status
     AND (NEW.object, NEW.ata_number, NEW.validity_end, NEW.validity_start) IS DISTINCT FROM
         (OLD.object, OLD.ata_number, OLD.validity_end, OLD.validity_start) THEN
    NEW.status := 'em_validacao';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_ata_status BEFORE INSERT OR UPDATE ON price_registration_atas
  FOR EACH ROW EXECUTE FUNCTION guard_ata_status();

-- Impede auto-promoção de papel de plataforma
CREATE OR REPLACE FUNCTION guard_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT app_is_admin() AND (NEW.platform_role IS DISTINCT FROM OLD.platform_role OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.password_hash IS DISTINCT FROM OLD.password_hash) THEN
    RAISE EXCEPTION 'Alteração restrita' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_user_role BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_user_role();

CREATE OR REPLACE FUNCTION guard_org_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT app_is_admin() AND (NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.kind IS DISTINCT FROM OLD.kind) THEN
    RAISE EXCEPTION 'Alteração restrita à administração' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_org BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION guard_org_verification();

-- ---------------------------------------------------------------------
-- Habilita RLS em todas as tabelas
-- ---------------------------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Usuários
CREATE POLICY users_sel ON users FOR SELECT USING (id = app_uid() OR app_is_admin());
CREATE POLICY users_ins ON users FOR INSERT WITH CHECK (app_is_system());
CREATE POLICY users_upd ON users FOR UPDATE USING (id = app_uid() OR app_is_admin());

CREATE POLICY sessions_all ON sessions USING (app_is_system()) WITH CHECK (app_is_system());
CREATE POLICY prt_all ON password_reset_tokens USING (app_is_system()) WITH CHECK (app_is_system());
CREATE POLICY outbox_all ON email_outbox USING (app_is_admin()) WITH CHECK (true);

-- Organizações
CREATE POLICY org_sel ON organizations FOR SELECT USING (app_is_admin() OR id IN (SELECT app_org_ids()));
CREATE POLICY org_ins ON organizations FOR INSERT WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY org_upd ON organizations FOR UPDATE USING (app_is_admin() OR id IN (SELECT app_org_admin_ids()));

CREATE POLICY mem_sel ON organization_members FOR SELECT
  USING (app_is_admin() OR user_id = app_uid() OR organization_id IN (SELECT app_org_ids()));
CREATE POLICY mem_ins ON organization_members FOR INSERT
  WITH CHECK (app_is_admin() OR organization_id IN (SELECT app_org_admin_ids()));
CREATE POLICY mem_upd ON organization_members FOR UPDATE
  USING (app_is_admin() OR organization_id IN (SELECT app_org_admin_ids()));
CREATE POLICY mem_del ON organization_members FOR DELETE
  USING (app_is_admin() OR organization_id IN (SELECT app_org_admin_ids()));

-- Dados públicos de mercado
CREATE POLICY sup_sel ON suppliers FOR SELECT USING (true);
CREATE POLICY sup_ins ON suppliers FOR INSERT WITH CHECK (app_is_admin());
CREATE POLICY sup_upd ON suppliers FOR UPDATE USING (app_is_admin() OR id IN (SELECT app_supplier_ids()));

CREATE POLICY gov_sel ON government_entities FOR SELECT USING (true);
CREATE POLICY gov_write ON government_entities FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

CREATE POLICY cat_sel ON categories FOR SELECT USING (active OR app_is_admin());
CREATE POLICY cat_write ON categories FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

CREATE POLICY src_sel ON ata_sources FOR SELECT USING (true);
CREATE POLICY src_write ON ata_sources FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

CREATE POLICY proc_sel ON procurement_records FOR SELECT USING (true);
CREATE POLICY proc_write ON procurement_records FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Atas
CREATE POLICY ata_sel ON price_registration_atas FOR SELECT USING (
  ata_status_is_public(status) OR app_is_admin()
  OR submitted_by_org_id IN (SELECT app_org_ids())
  OR supplier_id IN (SELECT app_supplier_ids()));
CREATE POLICY ata_ins ON price_registration_atas FOR INSERT WITH CHECK (
  app_is_admin() OR (submitted_by_org_id IN (SELECT app_org_ids())
    AND (supplier_id IS NULL OR supplier_id IN (SELECT app_declared_supplier_ids()))));
CREATE POLICY ata_upd ON price_registration_atas FOR UPDATE USING (
  app_is_admin() OR submitted_by_org_id IN (SELECT app_org_ids()) OR supplier_id IN (SELECT app_supplier_ids()));
CREATE POLICY ata_del ON price_registration_atas FOR DELETE USING (
  app_is_admin() OR (submitted_by_org_id IN (SELECT app_org_ids()) AND status = 'rascunho'));

CREATE POLICY items_sel ON ata_items FOR SELECT USING (
  (ata_id IS NULL) OR app_can_view_ata(ata_id));
CREATE POLICY items_write ON ata_items FOR ALL
  USING (app_is_admin() OR (ata_id IS NOT NULL AND app_can_edit_ata(ata_id)))
  WITH CHECK (app_is_admin() OR (ata_id IS NOT NULL AND app_can_edit_ata(ata_id) AND link_status = 'informado_fornecedor'));

CREATE POLICY docs_sel ON ata_documents FOR SELECT USING (
  app_is_admin()
  OR owner_org_id IN (SELECT app_org_ids())
  OR (ata_id IS NOT NULL AND app_can_edit_ata(ata_id))
  OR (visibility = 'public' AND (ata_id IS NULL OR app_can_view_ata(ata_id))));
CREATE POLICY docs_ins ON ata_documents FOR INSERT WITH CHECK (
  app_is_admin() OR (owner_org_id IN (SELECT app_org_ids()) AND (ata_id IS NULL OR app_can_edit_ata(ata_id))));
CREATE POLICY docs_upd ON ata_documents FOR UPDATE USING (app_is_admin() OR owner_org_id IN (SELECT app_org_ids()));
CREATE POLICY docs_del ON ata_documents FOR DELETE USING (app_is_admin() OR owner_org_id IN (SELECT app_org_ids()));

CREATE POLICY hist_sel ON ata_status_history FOR SELECT USING (app_can_view_ata(ata_id));
CREATE POLICY hist_ins ON ata_status_history FOR INSERT WITH CHECK (app_can_edit_ata(ata_id));
CREATE POLICY chg_sel ON ata_change_log FOR SELECT USING (app_can_view_ata(ata_id));
CREATE POLICY chg_ins ON ata_change_log FOR INSERT WITH CHECK (app_can_edit_ata(ata_id));

CREATE POLICY assess_sel ON ata_adhesion_assessments FOR SELECT USING (
  app_is_admin() OR (scope = 'plataforma' AND app_can_view_ata(ata_id)) OR organization_id IN (SELECT app_org_ids()));
CREATE POLICY assess_ins ON ata_adhesion_assessments FOR INSERT WITH CHECK (
  app_is_admin() OR (scope = 'orgao' AND organization_id IN (SELECT app_org_ids())));

CREATE POLICY extr_all ON ata_extractions USING (app_is_admin() OR organization_id IN (SELECT app_org_ids()))
  WITH CHECK (app_is_admin() OR organization_id IN (SELECT app_org_ids()));

CREATE POLICY claims_sel ON supplier_claims FOR SELECT USING (app_is_admin() OR claimant_org_id IN (SELECT app_org_ids()));
CREATE POLICY claims_ins ON supplier_claims FOR INSERT WITH CHECK (
  claimant_user_id = app_uid() AND claimant_org_id IN (SELECT app_org_ids()) AND status = 'pendente');
CREATE POLICY claims_upd ON supplier_claims FOR UPDATE USING (app_is_admin());

-- Ferramentas pessoais
CREATE POLICY fav_all ON favorites USING (user_id = app_uid() OR app_is_admin()) WITH CHECK (user_id = app_uid());
CREATE POLICY ss_all ON saved_searches USING (user_id = app_uid() OR app_is_admin()) WITH CHECK (user_id = app_uid());
CREATE POLICY alerts_all ON alerts USING (user_id = app_uid() OR app_is_admin()) WITH CHECK (user_id = app_uid() OR app_is_system());
CREATE POLICY notif_sel ON notifications FOR SELECT USING (user_id = app_uid() OR app_is_admin());
CREATE POLICY notif_upd ON notifications FOR UPDATE USING (user_id = app_uid());
CREATE POLICY notif_ins ON notifications FOR INSERT WITH CHECK (true);  -- notificações geradas pelo servidor

CREATE POLICY slog_ins ON search_logs FOR INSERT WITH CHECK (user_id IS NULL OR user_id = app_uid());
CREATE POLICY slog_sel ON search_logs FOR SELECT USING (app_is_admin() OR user_id = app_uid());

CREATE POLICY views_ins ON ata_view_events FOR INSERT WITH CHECK (true);
CREATE POLICY views_sel ON ata_view_events FOR SELECT USING (app_is_admin() OR app_can_edit_ata(ata_id));

-- Conexão comercial
CREATE POLICY cr_sel ON contact_requests FOR SELECT USING (
  app_is_admin() OR requester_org_id IN (SELECT app_org_ids()) OR supplier_id IN (SELECT app_supplier_ids()));
CREATE POLICY cr_ins ON contact_requests FOR INSERT WITH CHECK (
  requester_user_id = app_uid() AND requester_org_id IN (SELECT app_org_ids()));
CREATE POLICY cr_upd ON contact_requests FOR UPDATE USING (
  app_is_admin() OR requester_org_id IN (SELECT app_org_ids()) OR supplier_id IN (SELECT app_supplier_ids()));

CREATE POLICY opp_all ON commercial_opportunities
  USING (app_is_admin() OR supplier_org_id IN (SELECT app_org_ids()))
  WITH CHECK (app_is_system() OR supplier_org_id IN (SELECT app_org_ids()));
CREATE POLICY oppev_all ON opportunity_events
  USING (app_is_admin() OR opportunity_id IN (SELECT id FROM commercial_opportunities))
  WITH CHECK (app_is_system() OR opportunity_id IN (SELECT id FROM commercial_opportunities));

-- Planos e cobrança
CREATE POLICY plans_sel ON subscription_plans FOR SELECT USING (active OR app_is_admin());
CREATE POLICY plans_write ON subscription_plans FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());
CREATE POLICY subs_sel ON subscriptions FOR SELECT USING (app_is_admin() OR organization_id IN (SELECT app_org_ids()));
CREATE POLICY subs_write ON subscriptions FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());
CREATE POLICY pay_sel ON payments FOR SELECT USING (app_is_admin() OR organization_id IN (SELECT app_org_ids()));
CREATE POLICY pay_write ON payments FOR ALL USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Auditoria e operação
CREATE POLICY audit_ins ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY audit_sel ON audit_logs FOR SELECT USING (app_is_admin());
CREATE POLICY sync_all ON synchronization_logs USING (app_is_admin()) WITH CHECK (app_is_admin());
CREATE POLICY dsr_sel ON data_subject_requests FOR SELECT USING (app_is_admin() OR user_id = app_uid());
CREATE POLICY dsr_ins ON data_subject_requests FOR INSERT WITH CHECK (user_id IS NULL OR user_id = app_uid() OR app_is_system());
CREATE POLICY dsr_upd ON data_subject_requests FOR UPDATE USING (app_is_admin());

-- Visão pública de fornecedores (contato só com consentimento e conta vinculada)
CREATE OR REPLACE VIEW public_suppliers WITH (security_invoker = true) AS
SELECT id, cnpj, person_type, legal_name, trade_name, cnae, company_size, city, state,
       profile_description, website, featured, (organization_id IS NOT NULL) AS account_linked,
       CASE WHEN show_contact AND organization_id IS NOT NULL THEN public_email END AS public_email,
       CASE WHEN show_contact AND organization_id IS NOT NULL THEN public_phone END AS public_phone
FROM suppliers;

-- Permissões
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_runtime;
REVOKE ALL ON TABLE schema_migrations FROM app_runtime;
