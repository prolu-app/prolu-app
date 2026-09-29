-- ════════════════════════════════════════════════════════════════
-- Teste DEPOIS da migration_022 — somente leitura (termina em rollback).
--
-- Simula um usuário real e mostra o que ele pode ler/escrever na Base de
-- Conhecimento. Rode 1 vez para cada perfil, trocando <AUTH_ID> pelo
-- auth_id do usuário (tabela usuarios, coluna auth_id):
--   - master da Talita Shigueoka
--   - um comum de qualquer escritório
--   - o prolu_admin
--
-- Esperado:
--                              master   comum   prolu_admin
--   pode_escrever_prolu         false    false   true
--   pode_escrever_propria       true     false   true
--   pastas_de_outros_visiveis   0        0       > 0 (leitura p/ suporte)
--   modulos_de_outros_visiveis  0        0       > 0
--   aulas_de_outros_visiveis    0        0       > 0
-- ════════════════════════════════════════════════════════════════
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<AUTH_ID>", "role": "authenticated"}';

select
  (select role from usuarios where auth_id = auth.uid())  as perfil,
  auth_empresa_id()                                       as minha_empresa,
  kb_pode_escrever(null)                                  as pode_escrever_prolu,
  kb_pode_escrever(auth_empresa_id())                     as pode_escrever_propria,
  (select count(*) from kb_pastas  where empresa_id is distinct from auth_empresa_id() and empresa_id is not null) as pastas_de_outros_visiveis,
  (select count(*) from kb_modulos where empresa_id is distinct from auth_empresa_id() and empresa_id is not null) as modulos_de_outros_visiveis,
  (select count(*) from kb_aulas   where empresa_id is distinct from auth_empresa_id() and empresa_id is not null) as aulas_de_outros_visiveis;

rollback;
