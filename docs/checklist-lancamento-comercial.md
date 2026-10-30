# Checklist de lançamento comercial

Atualizado em 30/10/2026. Complementa `docs/avaliacao-comercial-e-piloto.md`. **Responsável**: _Você_ = proprietário, _Dev_ = trabalho técnico no repositório, _Jurídico_ = advogado/contador. **Situação**: ✅ feito, 🟡 parcial, ⬜ pendente.

## 1. Segurança e dados

| Item | Resp. | Situação | Observação |
|---|---|---|---|
| RLS em todas as tabelas, isolamento entre confeitarias | Dev | ✅ | Testes no CI (`multiempresa-isolation`, `equipe`, `plataforma`) |
| Papel anônimo sem acesso a tabelas | Dev | ✅ | Migração 0048 e dois testes |
| Preço, taxa e custo do catálogo calculados no servidor | Dev | ✅ | `catalogo-smoke.sql` |
| Recursos pagos conferidos no servidor (IA) | Dev | ✅ | Etapa G |
| Backup automático confirmado e **restauração testada** | Você | ⬜ | `docs/operacao/backup-e-recuperacao.md` |
| Cópia dos arquivos (fotos) fora do backup do banco | Você | ⬜ | Confirmar se o Storage é coberto |
| Verificação em duas etapas na conta do proprietário (provedor, GitHub) e do administrador da plataforma | Você | ⬜ | Conta de administrador enxerga todas as empresas |
| Alertas de dependências vulneráveis (Dependabot) ativos | Você | 🟡 | Arquivo de configuração pronto (#221); falta ligar os alertas nas configurações do GitHub |
| Limite de tentativas em consultas públicas e na IA | Dev | ⬜ | Risco 5 da avaliação |
| Cabeçalhos de segurança do site (CSP, HSTS etc.) | Dev | ⬜ | Depende de como o Lovable serve o site; verificar antes de mexer |
| Ambiente de teste separado da produção (projeto Supabase de homologação) | Você + Dev | ⬜ | Hoje migrações novas vão direto à produção |
| Teste de invasão externo | Você | ⬜ | Foco: isolamento e catálogo público |
| Registro de migrações aplicadas em produção | Você + Dev | 🟡 | Tabela em `docs/operacao/migracoes.md` a preencher |
| Procedimento de incidentes | Dev | ✅ | `docs/operacao/incidentes.md` |

## 2. Jurídico e LGPD

| Item | Resp. | Situação | Observação |
|---|---|---|---|
| Termos de uso e política de privacidade publicados | Dev | ✅ | `/termos` e `/privacidade`, responsável configurável |
| Revisão por advogado | Jurídico | ⬜ | Antes de cadastrar clientes de terceiros |
| Política já trata controladora/operadora, nuvem possivelmente fora do Brasil, guarda, direitos e contato | Dev | ✅ | Texto em `src/lib/termos.ts` (seções 1 a 7 da política) |
| Política passa a citar o uso de IA (leitura de documentos e rascunho de pedido enviam conteúdo a um provedor de IA) e as notificações push | Jurídico + Dev | ⬜ | O texto atual não menciona esses dois pontos; aumentar `TERMOS_VERSAO` ao alterar |
| Prazo concreto de exclusão após o encerramento (hoje: "prazo razoável") | Jurídico | ⬜ | |
| Relação controladora/operadora (confeiteira × plataforma) também em contrato | Jurídico | ⬜ | A política descreve os papéis; falta o contrato de assinatura |
| Contrato/termo de assinatura (cancelamento, devolução de dados, SLA) | Jurídico | ⬜ | |
| Exportação dos dados pela dona | Dev | ✅ | Cópia completa e planilha |
| Exclusão de conta e dados | Dev | 🟡 | Hoje é manual: a dona pede pelo canal de contato (termos, seção 7). Não há rotina nem botão; criar exige decidir retenção e dados fiscais |
| CNPJ, forma de cobrança e emissão de recibo/nota | Você + Jurídico | ⬜ | |
| Registro da marca "Doce Gestão" (busca no INPI) | Você | ⬜ | |

## 3. Domínio, e-mail e marca

| Item | Resp. | Situação | Observação |
|---|---|---|---|
| Domínio próprio (ex.: `.com.br`) para site, sistema e catálogo | Você | ⬜ | Hoje: `minhaconfeitaria.lovable.app` |
| Subdomínio para o painel de administração | Você + Dev | ⬜ | Hoje no GitHub Pages |
| E-mail profissional (suporte@) com SPF, DKIM e DMARC | Você | ⬜ | |
| Atualizar os links do sistema, termos e `SECURITY.md` para o novo domínio | Dev | ⬜ | Depois do domínio |

## 4. Documentação e suporte

| Item | Resp. | Situação | Observação |
|---|---|---|---|
| README técnico, arquitetura, `.env.example`, `SECURITY.md`, `CHANGELOG.md` | Dev | ✅ | Este PR |
| Procedimentos de backup, migração e incidente | Dev | ✅ | `docs/operacao/` (backup depende do teste real) |
| Central de ajuda e guia de primeiros passos para as donas | Dev + Você | ⬜ | Pode partir da lista "Primeiros passos" do sistema |
| Vídeos curtos de treinamento (pedido, produção, receita, recebimento) | Você | ⬜ | |
| Canal e horário de suporte do piloto | Você | ⬜ | |
| Preencher contato em `SECURITY.md` | Você | ⬜ | Dois campos marcados `[PREENCHER]` |

## 5. Código e operação

| Item | Resp. | Situação | Observação |
|---|---|---|---|
| Testes unitários, de tipos, build e de banco no CI | Dev | ✅ | |
| Testes automáticos das telas (navegador) | Dev | ⬜ | A falha de "duplicar produto" (#222) passaria por eles |
| Testes dos módulos de `src/lib` ainda descobertos | Dev | ⬜ | 11 módulos |
| Lockfile apontando para registro privado do Lovable | Dev | ⬜ | `bun.lock` tem endereços de um cache privado; trocar exige validar a instalação num ambiente com acesso ao registro público |
| Dividir telas grandes e limpar avisos de lint | Dev | ⬜ | |
| Regra de status do pedido no servidor | Dev | ⬜ | Hoje a passagem para "em produção" só ocorre quando alguém abre o app |
| Monitoramento de disponibilidade com alerta e página de status | Você + Dev | ⬜ | |
| Plano de saída do Lovable Cloud (exportar e migrar) | Você + Dev | ⬜ | |
| Arquivo de licença do código | Você | ⬜ | Decidir se é código fechado |
| Cobrança automática (Pix/cartão) e recibo | Dev | ⬜ | Piloto pode usar cobrança manual |

## 6. Antes do primeiro piloto (mínimo)

1. Backup confirmado e restauração testada.
2. Alertas de dependências ligados e 2FA nas contas principais.
3. Ensaio completo de cadastro de uma confeitaria nova, em conta de teste.
4. Termos e privacidade revisados.
5. Canal de suporte definido.
6. `SECURITY.md` com contato preenchido.
