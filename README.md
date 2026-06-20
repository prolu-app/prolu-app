# Prolu App

Portal de gestão comercial e base de conhecimento para escritórios de arquitetura.

## Stack
- React 18 + Vite 5
- React Router 6
- Supabase (PostgreSQL + Auth + RLS)
- Vercel (deploy + função serverless do Agente Prolu)

## Rodando localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. **Sem configurar o `.env`, o app entra em modo demonstração**: login automático como André (master), com dados de exemplo em `src/data/seed.js`. Dá para navegar por todas as telas sem banco nenhum.

## Conectando o Supabase de verdade

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Vá em **SQL Editor** e rode o conteúdo de `supabase/schema.sql` (cria todas as tabelas e políticas de RLS).
3. Copie `.env.example` para `.env` e preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` — **use a chave Legacy (`anon` / `public`, começa com `eyJ`)**, não a Publishable key nova.
4. Crie a primeira empresa e o primeiro usuário master:
   - Cadastre o André via Supabase Auth (e-mail/senha).
   - Insira uma linha em `empresas`.
   - Insira uma linha em `usuarios` com `auth_id` = id do usuário criado no Auth, `role = 'master'`, `empresa_id` apontando para a empresa criada.
5. Reinicie o `npm run dev` — o app sai do modo demonstração automaticamente.

## Deploy na Vercel

```bash
vercel
```

Configure as variáveis de ambiente no painel da Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). O `vercel.json` já trata o roteamento de SPA.

## Agente Prolu (opcional)

`api/chat.js` é uma função serverless que faz proxy para a API da Anthropic, usando `ANTHROPIC_API_KEY` (nunca exposta no browser). Hoje a barra do Agente Prolu no Início ainda não chama essa função — é o próximo passo de integração quando o chat for construído.

## Estrutura

```
src/
  components/      Layout (sidebar/drawer) e ícones compartilhados
  contexts/         AuthContext (login + role) e ToastContext
  data/seed.js       Dados de demonstração, no formato das tabelas do Supabase
  screens/           Uma pasta por tela: Inicio, BaseConhecimento, CRM,
                      Dashboard, PlanoPratico, ClienteIdeal, Indicadores
  services/          Cliente Supabase
supabase/schema.sql  Schema completo com RLS (rodar uma vez no projeto novo)
api/chat.js          Proxy serverless do Agente Prolu
```

## Papéis de usuário

- **master**: vê e usa tudo, inclusive os controles de admin na Base de Conhecimento (criar pasta, módulo, aula).
- **comum**: acesso de uso, sem os controles de criação de conteúdo.

## Próximos passos sugeridos

- Trocar os imports de `src/data/seed.js` por queries reais ao Supabase em cada tela.
- Construir a interface de chat do Agente Prolu (a barra no Início já está pronta para abrir essa tela).
- Migrar os dados do Firestore legado (Precificação) para as tabelas legado do schema.
- Decidir se Precificação é liberada para todos os planos de Mentoria ou vendida à parte.
