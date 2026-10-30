# Histórico de mudanças

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/). As entradas anteriores à auditoria resumem o `roadmap.md`; a partir daqui, registre cada mudança relevante ao abrir o PR.

## [Não lançado]

### Documentação
- README técnico, `.env.example`, `SECURITY.md`, `docs/arquitetura.md`, procedimentos de operação (`docs/operacao/`) e checklist de lançamento comercial.

## 2026-10-29 — Auditoria e preparação comercial

### Corrigido
- Duplicar produto: o botão enviava um valor que a tela não reconhecia, então salvar a cópia editava o produto original e esbarrava na trava de receita com pedido em aberto. Agora cria um produto novo (#222).
- `salvar_pedido` passou a preservar recebimentos já registrados (migração 0047, #212).

### Segurança
- Privilégios de tabela do papel anônimo revogados, exceto leitura dos planos (migração 0048, #220); teste de regressão do acesso anônimo (#215).
- Leitura de documentos por IA confere plano e assinatura no servidor (#216).
- Dependabot configurado para Bun, somente atualizações de segurança (#221).

### Qualidade
- Fórmulas de contas a pagar em um módulo único e testado (#214); teste da fórmula de custo (#213).
- Lint do CI cobre todo o código; testes de formatação, CSV e avisos de WhatsApp (#217, #218).
- Menu "Mais" agrupado, com lista de links em um só lugar (#210).
- Auditoria, plano de melhorias e avaliação comercial (#209, #211, #219).

## Antes de 2026-10-29

Resumo em `roadmap.md`: pedidos, produção, receitas e custos, estoque e compras, financeiro, catálogo online com Pix, multiempresa, equipe, planos e assinaturas, painel de administração separado, notificações push, monitoramento de erros.
