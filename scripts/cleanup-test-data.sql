-- Remove dados criados pelos testes E2E (organizações de teste e tudo o que delas depende).
-- NÃO usar em produção sem revisar: apaga organizações, usuários não-admin e atas cadastradas por fornecedores.
-- Uso: psql "$DATABASE_ADMIN_URL" -f scripts/cleanup-test-data.sql
BEGIN;
DELETE FROM contact_requests;
DELETE FROM commercial_opportunities;
DELETE FROM supplier_claims;
DELETE FROM ata_extractions;
DELETE FROM ata_documents WHERE owner_org_id IS NOT NULL;
DELETE FROM price_registration_atas WHERE origin = 'fornecedor';
DELETE FROM favorites; DELETE FROM alerts; DELETE FROM saved_searches; DELETE FROM notifications;
DELETE FROM payments; DELETE FROM subscriptions;
UPDATE suppliers SET organization_id = NULL WHERE organization_id IS NOT NULL;
DELETE FROM suppliers s WHERE first_seen_source = 'cadastro'
  AND NOT EXISTS (SELECT 1 FROM ata_items i WHERE i.supplier_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM price_registration_atas a WHERE a.supplier_id = s.id);
UPDATE government_entities SET organization_id = NULL;
DELETE FROM government_entities g
 WHERE NOT EXISTS (SELECT 1 FROM price_registration_atas a WHERE a.managing_entity_id = g.id)
   AND NOT EXISTS (SELECT 1 FROM procurement_records p WHERE p.government_entity_id = g.id);
DELETE FROM organizations;
DELETE FROM users WHERE platform_role <> 'admin';
DELETE FROM sessions; DELETE FROM password_reset_tokens; DELETE FROM email_outbox;
DELETE FROM search_logs; DELETE FROM ata_view_events; DELETE FROM data_subject_requests;
UPDATE price_registration_atas SET views_count = 0 WHERE views_count > 0;
COMMIT;
