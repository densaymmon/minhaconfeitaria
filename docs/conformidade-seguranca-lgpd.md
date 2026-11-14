# Conformidade: segurança, LGPD, consumidor e produção

Auditoria de 13/11/2026 sobre o código na `main` (último PR: #236). Cobre os 40 itens da lista de verificação do proprietário.
**Situação:** ✅ atendido · 🛠 corrigido nesta rodada · 🟡 parcial · ⬜ depende de decisão ou ação do proprietário (ou de migração de banco, aplicada à mão em produção).

> Isto é um roteiro técnico, não aconselhamento jurídico. Os textos legais precisam de revisão por advogado antes do piloto.

## 1. Segurança e proteção

| Item | Situação | Evidência / o que foi feito | Falta |
|---|---|---|---|
| Autenticação segura | 🛠 | Supabase Auth; o servidor valida o token (`getClaims`) em toda função protegida (`auth-middleware.ts`). Cadastro fechado por padrão. Senha mínima subiu de 8 para 10 caracteres, bloqueia senhas comuns e senha com o e-mail (`src/lib/senha.ts`, usada em cadastro, convite, recuperação e painel admin). | No painel Supabase Auth: tamanho mínimo 10, proteção contra senhas vazadas, confirmação de e-mail ligada. O app ainda não oferece 2FA para as donas. |
| Controle de acesso | ✅ | RLS em toda tabela por confeitaria (`_tenant()`), papéis `gerente`/`producao` com políticas RESTRICTIVE, administração da plataforma separada (`_eh_admin()`), `anon` sem acesso a tabelas (0048). Testes `multiempresa-isolation`, `equipe`, `plataforma`, `anon-*` no CI. | — |
| Criptografia de dados | 🟡 | Em trânsito: TLS. Em repouso: criptografia do provedor (Supabase/Lovable Cloud). Chave privada de push só em `plataforma_segredos` (service role). | Confirmar com o provedor a criptografia em repouso e em backups. Dados como WhatsApp e chave Pix não têm criptografia por campo (decisão: aceitável com RLS). |
| HTTPS / TLS | 🛠 | Site servido por HTTPS. Agora toda resposta leva `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` (`src/lib/cabecalhos-seguranca.ts`, aplicado em `src/server.ts`). | Conferir após o deploy: `curl -sI https://minhaconfeitaria.lovable.app` deve mostrar os cabeçalhos. Se a hospedagem os remover, tratar no domínio próprio. |
| Hashing de senhas | ✅ | Senhas ficam só no Supabase Auth (bcrypt); o app nunca as guarda nem registra. | — |
| SQL Injection | ✅ | Verificado: acesso a dados via cliente Supabase (consultas parametrizadas); 120 funções SQL, todas `SECURITY DEFINER` com `search_path` fixo; `EXECUTE format` só em migrações, com `%I` e sem entrada de usuário. | — |
| XSS / CSRF | 🟡 | React escapa texto. `dangerouslySetInnerHTML` só em 2 lugares (script de redirecionamento do `__root.tsx` com constante serializada; CSS de gráfico em `chart.tsx`). CSRF: `createCsrfMiddleware` nas funções de servidor, autenticação por token no cabeçalho (não por cookie). | CSP ainda não definida (risco de quebrar o iframe do editor Lovable): testar em modo Report-Only. O leitor de notas (OCR) carrega scripts de CDN sem SRI (`purchase-document-ocr.ts`): fixar com hash ou hospedar no projeto. |
| Rate limiting | 🟡 | 🛠 Leitura de pedido por IA: 20 chamadas/10 min por usuária (`limite-taxa.ts`, em memória). Já existiam: aviso push 1 por pedido, `registrar_erro` 200/hora, cadastro fechado. | ⬜ Funções públicas do catálogo (`criar_pedido_catalogo`, `validar_cupom_catalogo`, `acompanhar_pedido_catalogo`…): exige migração com tabela de limite por IP/telefone. Proposta: próxima migração (0051) + teste em `tests/db/`. Limites de login do Supabase Auth: confirmar no painel. |
| Proteção de APIs | ✅ | Funções de servidor com `requireSupabaseAuth` e validação `zod`; IA confere plano no servidor; MCP somente leitura com OAuth e RLS; cron com comparação em tempo constante (`cron-auth.ts`); respostas de erro sem detalhes internos. | — |
| Auditoria de dependências | 🛠 | Dependabot de segurança (#221). Novo `.github/workflows/seguranca.yml`: `bun audit` e CodeQL toda segunda e sob demanda (não bloqueia PRs). | ⬜ Ligar os alertas do Dependabot e o Code scanning nas configurações do GitHub. `bun.lock` aponta para cache privado do Lovable. |

## 2. LGPD e privacidade — ver PR de textos legais

Itens: Política de Privacidade, bases legais, minimização, finalidades, consentimento, cookies, direitos dos titulares, exclusão, retenção, contratos com operadores. O PR separado (rascunho) reescreve `src/lib/termos.ts`; o que depende de decisão está listado nele.

## 3. Consumidor e negócios — ver PR de textos legais

Itens: Termos de Uso, transparência de preços, cobranças, cancelamento, reembolso, identificação do fornecedor, publicidade, depoimentos, licenças de uso, transparência sobre IA.

## 4. Produção e responsabilidade

| Item | Situação | Evidência / o que foi feito | Falta |
|---|---|---|---|
| Backups automatizados | ⬜ | Roteiro em `docs/operacao/backup-e-recuperacao.md`. | **Risco nº 1.** Confirmar backup no provedor, incluir Storage (fotos) e **testar uma restauração**. |
| Logs seguros | 🛠 | Erros de tela vão para `erros_app` (30 dias, sem corpo de pedido). Agora o endereço enviado esconde códigos de pedido/convite além de remover `?` e `#` (`limparUrl`). | Revisar logs do provedor (não acessíveis daqui). |
| Monitoramento de ameaças | 🟡 | Painel de erros da administração; histórico de alterações (`historico`). | ⬜ Monitor de disponibilidade com alerta (ex.: UptimeRobot) e alerta de login suspeito no Supabase. |
| Resposta a incidentes | ✅ | `docs/operacao/incidentes.md`. | Treinar o roteiro uma vez. |
| Notificação de incidentes | 🛠 | Roteiro atualizado com prazos da ANPD e modelo de aviso. | Advogado confirma prazos e conteúdo. |
| Testes de segurança | 🟡 | Mais de 20 testes SQL de isolamento, catálogo e acesso anônimo rodam no CI. Novos testes: cabeçalhos, limite, senha, URL. | ⬜ Teste de invasão externo antes de abrir cadastro. |
| Revisão de código | 🟡 | CI obrigatório (lint, tipos, testes, build, banco) e merge automático quando passa. | Decisão do proprietário: exigir revisão humana para mudanças em `drizzle/migrations/`, `src/lib/termos.ts` e `.github/` (regra de proteção de branch/CODEOWNERS). |
| Privilégios administrativos | 🟡 | Admin só por e-mail em `plataforma_admin_emails`, site separado, `service_role` só no servidor, `producao` sem acesso financeiro. | ⬜ 2FA no GitHub, Lovable e Supabase; revisar quem tem acesso ao painel do provedor. |
| Gestão de vulnerabilidades | 🟡 | `SECURITY.md`, Dependabot, auditoria semanal. | ⬜ Preencher os dois campos `[PREENCHER]` do `SECURITY.md` (e-mail de segurança e prazo). |
| Auditoria de conformidade | 🛠 | Este documento. | Repetir a cada trimestre e a cada mudança relevante de dados/IA. |

## Próximos passos técnicos (precisam de migração, aplicar à mão e conferir)

1. **0051 — limite de tentativas no banco** para as funções públicas do catálogo, com teste.
2. **Exclusão de conta autoatendida** (hoje manual): fila de solicitações + rotina que apaga ou anonimiza, respeitando dados fiscais e financeiros.
3. **CSP em modo Report-Only**, depois enforcement; SRI/hospedagem própria do OCR.
4. **2FA** para donas e administradores.
