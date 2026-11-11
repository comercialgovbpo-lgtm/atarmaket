-- Migração 0004: funções auxiliares controladas
-- Permite que fornecedores referenciem um órgão gerenciador ainda inexistente na base sem conceder INSERT geral.
CREATE OR REPLACE FUNCTION ensure_government_entity(p_cnpj text, p_name text, p_sphere text, p_state text, p_city text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF app_uid() IS NULL AND NOT app_is_admin() THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  IF p_cnpj !~ '^\d{14}$' THEN RAISE EXCEPTION 'CNPJ inválido'; END IF;
  SELECT id INTO v_id FROM government_entities WHERE cnpj = p_cnpj;
  IF v_id IS NULL THEN
    INSERT INTO government_entities(cnpj, name, sphere, state, city)
    VALUES (p_cnpj, left(p_name, 300),
            CASE WHEN p_sphere IN ('federal','estadual','distrital','municipal') THEN p_sphere END,
            CASE WHEN p_state ~ '^[A-Z]{2}$' THEN p_state END, left(p_city, 120))
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION ensure_government_entity(text, text, text, text, text) TO app_runtime;

-- Visualizações agregadas por ata para o fornecedor (sem expor eventos individuais)
CREATE INDEX IF NOT EXISTS idx_contact_ata ON contact_requests(ata_id);
