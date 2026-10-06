-- ════════════════════════════════════════════════════════════════
-- MIGRATION 044 — Modelo inicial de formulário (dados)
-- Rodar no SQL Editor do Supabase DEPOIS da migration_043.
-- Só insere se ainda não existir um modelo com o mesmo nome (pode rodar de
-- novo sem duplicar).
-- ════════════════════════════════════════════════════════════════

do $$
declare
  v_nome constant text := 'Orçamento — Projeto Residencial/Comercial';
  v_id uuid;
begin
  if exists (select 1 from form_templates where nome = v_nome) then
    raise notice 'Modelo "%" já existe — nada a fazer', v_nome;
    return;
  end if;

  insert into form_templates (id, nome, descricao, ativo, ordem)
  values (
    gen_random_uuid(),
    v_nome,
    'Modelo de briefing inicial para quem já decidiu contratar o projeto e está pedindo orçamento.',
    true,
    0
  )
  returning id into v_id;

  insert into form_template_campos (id, template_id, label, tipo, obrigatorio, ordem, opcoes) values
    (gen_random_uuid(), v_id, 'Nome completo', 'text', true, 0, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'E-mail', 'email', true, 1, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Telefone/Celular', 'phone', true, 2, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Perfil do Instagram', 'text', false, 3, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Como conheceu o escritório?', 'radio', true, 4,
      '[{"value": "Instagram"}, {"value": "Indicação"}, {"value": "Anúncio"},
        {"value": "__outro__", "tipo": "outro"}]'::jsonb),
    (gen_random_uuid(), v_id, 'Qual tipo de projeto irá precisar?', 'radio', true, 5,
      '[{"value": "Terreno vazio e pretendo construir"},
        {"value": "Imóvel existente e desejo reformar"},
        {"value": "Imóvel na planta, será entregue pela construtora"},
        {"value": "Projeto comercial ou corporativo"},
        {"value": "__outro__", "tipo": "outro"}]'::jsonb),
    (gen_random_uuid(), v_id, 'Quantos metros quadrados tem aproximadamente o imóvel?', 'number', true, 6, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Localização (cidade, bairro)', 'textarea', true, 7, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Qual o endereço do imóvel, nome do empreendimento ou condomínio?', 'text', true, 8, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Caso ainda não tenha as chaves/liberação do imóvel, qual a previsão?', 'text', true, 9, '[]'::jsonb),
    (gen_random_uuid(), v_id, 'Para quais ambientes deseja o projeto?', 'radio', true, 10,
      '[{"value": "Todos os ambientes"},
        {"value": "Cozinha, lavanderia, sala, banheiro e sacada"},
        {"value": "Cozinha, lavanderia, sala e banheiro"},
        {"value": "Projeto comercial ou corporativo"},
        {"value": "__outro__", "tipo": "outro"}]'::jsonb),
    (gen_random_uuid(), v_id, 'Confirmação', 'checkbox', true, 11,
      '[{"value": "Estou de acordo com as condições acima combinadas"}]'::jsonb);
end $$;
