-- Reivindicação automática criada pelo servidor no cadastro da empresa
DROP POLICY claims_ins ON supplier_claims;
CREATE POLICY claims_ins ON supplier_claims FOR INSERT WITH CHECK (
  app_is_system() OR (claimant_user_id = app_uid() AND claimant_org_id IN (SELECT app_org_ids()) AND status = 'pendente'));
