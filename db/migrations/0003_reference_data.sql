-- =====================================================================
-- Migração 0003: dados de referência (configuráveis no painel admin)
-- Não contém atas, fornecedores ou órgãos fictícios.
-- =====================================================================
INSERT INTO ata_sources (code, name, kind, base_url, docs_url, config, terms_notes) VALUES
 ('pncp', 'PNCP — Portal Nacional de Contratações Públicas', 'api',
  'https://pncp.gov.br/api', 'https://pncp.gov.br/api/consulta/swagger-ui/index.html',
  '{"page_size": 50, "max_pages_per_run": 20, "request_interval_ms": 400, "window_days": 2, "fetch_items": true}',
  'API pública de consulta (Lei 14.133/2021, art. 174). Respeitar limites de requisição; dados replicados com indicação de fonte e link oficial.'),
 ('fornecedor', 'Cadastro pelo fornecedor', 'upload', NULL, NULL, '{}',
  'Atas enviadas por empresas. Publicação somente após moderação.'),
 ('manual', 'Importação manual autorizada', 'importacao_arquivo', NULL, NULL, '{}',
  'Para portais sem API: importação de documentos ou arquivos obtidos por meios autorizados, respeitando termos de uso.');

INSERT INTO categories (slug, name, icon, sort_order, keywords) VALUES
 ('saude', 'Saúde e medicamentos', 'stethoscope', 1, ARRAY['medicamento','medicamentos','hospitalar','hospitalares','saude','odontologic','laboratori','seringa','luva','farmac','insumo hospitalar','material medico','ortese','protese','reagente','vacina','curativo','soro']),
 ('tecnologia', 'Tecnologia da informação', 'monitor', 2, ARRAY['computador','notebook','software','impressora','servidor','informatica','tecnologia da informacao','licenca','rede logica','switch','monitor','tablet','nobreak','toner','cartucho','datacenter','telefonia','suprimentos de informatica']),
 ('veiculos', 'Veículos, máquinas e peças', 'truck', 3, ARRAY['veiculo','veiculos','automovel','caminhao','onibus','ambulancia','maquina','trator','motocicleta','pneu','pecas automotivas','retroescavadeira','motoniveladora','implemento']),
 ('combustiveis', 'Combustíveis e lubrificantes', 'fuel', 4, ARRAY['combustivel','combustiveis','gasolina','diesel','etanol','lubrificante','oleo lubrificante','gas liquefeito','glp']),
 ('alimentacao', 'Alimentação', 'utensils', 5, ARRAY['genero alimenticio','generos alimenticios','alimentacao','merenda','refeicao','refeicoes','hortifruti','carne','cafe','agua mineral','lanche','alimento']),
 ('limpeza', 'Limpeza e higiene', 'sparkles', 6, ARRAY['limpeza','higiene','saneante','descartavel','descartaveis','papel higienico','detergente','desinfetante']),
 ('expediente', 'Material de expediente e gráfico', 'pen', 7, ARRAY['expediente','material de escritorio','papel a4','grafico','grafica','impressos','envelope','caneta']),
 ('mobiliario', 'Mobiliário e equipamentos', 'armchair', 8, ARRAY['mobiliario','moveis','cadeira','mesa','armario','estante','eletrodomestico','ar condicionado','climatizacao','refrigerador','bebedouro']),
 ('engenharia', 'Obras e serviços de engenharia', 'hard-hat', 9, ARRAY['engenharia','obra','obras','pavimentacao','reforma','construcao','manutencao predial','asfalto','drenagem','sinalizacao viaria','iluminacao publica']),
 ('servicos', 'Serviços gerais e terceirização', 'briefcase', 10, ARRAY['locacao','vigilancia','terceirizacao','mao de obra','transporte','eventos','consultoria','manutencao','servico de','servicos de','buffet','publicidade']),
 ('educacao', 'Educação, esporte e cultura', 'graduation-cap', 11, ARRAY['didatico','escolar','pedagogico','uniforme','uniformes','livro','brinquedo','esportivo','material esportivo','kit escolar']),
 ('seguranca', 'Segurança, EPI e fardamento', 'shield', 12, ARRAY['epi','equipamento de protecao','fardamento','colete','seguranca publica','extintor','videomonitoramento','cftv']),
 ('outros', 'Outros', 'package', 99, ARRAY[]::text[]);

INSERT INTO subscription_plans (code, audience, name, description, price_cents, billing_interval, ata_limit, user_limit, features, highlights, sort_order) VALUES
 ('essencial', 'supplier', 'Essencial', 'Para empresas que estão começando a divulgar suas atas.', 14900, 'month', 3, 1,
  '{"marketplace_exposure": true, "receive_contacts": true, "company_profile": true}',
  ARRAY['Até 3 atas cadastradas','Perfil empresarial','Exposição no marketplace','Recebimento de contatos'], 1),
 ('profissional', 'supplier', 'Profissional', 'Gestão comercial completa da sua carteira de atas.', 34900, 'month', 15, 3,
  '{"marketplace_exposure": true, "receive_contacts": true, "company_profile": true, "full_profile": true, "opportunities_panel": true, "view_stats": true, "crm": true, "expiry_alerts": true}',
  ARRAY['Até 15 atas cadastradas','Perfil empresarial completo','Painel de oportunidades','Estatísticas de visualizações','Gestão de contatos (CRM)','Alertas de vencimento'], 2),
 ('enterprise', 'supplier', 'Enterprise', 'Para empresas com grande carteira de atas e equipe comercial.', 69900, 'month', 200, 20,
  '{"marketplace_exposure": true, "receive_contacts": true, "company_profile": true, "full_profile": true, "opportunities_panel": true, "view_stats": true, "crm": true, "expiry_alerts": true, "multi_users": true, "portfolio": true, "advanced_reports": true, "featured_eligible": true}',
  ARRAY['Limite ampliado de atas','Múltiplos usuários','Gestão de carteira de atas','Relatórios avançados','Elegível a destaque no marketplace'], 3),
 ('orgao_avaliacao', 'government', 'Avaliação institucional', 'Período de avaliação concedido automaticamente a órgãos cadastrados.', 0, 'month', NULL, 3,
  '{"trial_days": 30, "favorites": true, "contact_requests": true, "advanced_search": true, "compare": true, "saved_searches": true, "alerts": true, "search_history": true, "reports": false, "opportunity_management": true}',
  ARRAY['30 dias de acesso às ferramentas avançadas'], 10),
 ('orgao_essencial', 'government', 'Licença Essencial', 'Municípios e entidades de pequeno porte.', 300000, 'year', NULL, 3,
  '{"favorites": true, "contact_requests": true, "advanced_search": true, "compare": true, "saved_searches": true, "alerts": true, "search_history": true, "reports": false, "opportunity_management": true}',
  ARRAY['Pesquisa avançada','Comparador de atas','Favoritos e alertas','Histórico de pesquisas','Até 3 usuários'], 11),
 ('orgao_institucional', 'government', 'Licença Institucional', 'Órgãos de médio porte com equipe de compras.', 750000, 'year', NULL, 10,
  '{"favorites": true, "contact_requests": true, "advanced_search": true, "compare": true, "saved_searches": true, "alerts": true, "search_history": true, "reports": true, "opportunity_management": true}',
  ARRAY['Tudo da Essencial','Relatórios','Até 10 usuários'], 12),
 ('orgao_ampliada', 'government', 'Licença Ampliada', 'Estados, capitais e órgãos com múltiplas unidades.', 1200000, 'year', NULL, 50,
  '{"favorites": true, "contact_requests": true, "advanced_search": true, "compare": true, "saved_searches": true, "alerts": true, "search_history": true, "reports": true, "opportunity_management": true, "multi_units": true}',
  ARRAY['Tudo da Institucional','Até 50 usuários','Múltiplas unidades compradoras'], 13);
