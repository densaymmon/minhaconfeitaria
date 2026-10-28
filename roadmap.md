# Finalização
## Importação de documentos de compras
- [ ] Reutilizar XML/conferência e gravação de compras para PDF e imagens, com leitura visual real e revisão obrigatória.
- [ ] Validar arquivos, valores ausentes, associação segura, descontos e prevenção de duplicidade sem migrações.
- [ ] Executar testes e verificar a conferência autenticada sem gravar compras no banco ativo.

## Custos proporcionais dos ingredientes
- [x] Adicionar embalagem, medidas da receita e validações, com migração que preserva valores e medidas existentes.
- [x] Atualizar cadastro, cálculo, sinalização persistente e consultas de receitas; manter projeções legadas para compatibilidade.
- [x] Testar quatro exemplos, conversões inválidas, atualização e salvamento autenticados; 20 testes aprovados, sem erros no navegador ou transbordamento em 411 px. Registros temporários removidos.

- [x] Relatórios financeiros, despesas e taxas.
- [x] Corrigir formulários e validar registros no banco.
- [x] Testar cálculos, exportação e acesso protegido no celular.
- [ ] Verificar cadastros completos com sessão do proprietário — conta disponível; verificação dos demais cadastros não faz parte desta integração.

## Integrações de agentes
- [x] Ativar OAuth e adicionar ferramentas de consulta protegidas.
- [x] Criar autorização e preservar retorno pelo login.
- [x] Validar catálogo, bloqueio sem OAuth e consulta autenticada no servidor local.
- [x] Testar autorizar e recusar com serviço real e adaptação de origem apenas no navegador de teste.
- [ ] Verificar consentimento no endereço publicado — aguarda publicação autorizada pelo usuário.

## Rascunho por mensagem
- [x] Adicionar interpretação com Lovable AI e revisão antes de preencher pedido.
- [x] Validar interpretação real, revisão, preenchimento, salvamento e leitura com sessão do proprietário; pedido temporário removido e 12 testes aprovados.

## Evolução — Etapa 1 (ver docs/plano-evolucao.md)
- [x] Selo único de pagamento (Pago / Sinal pago / Pagamento pendente) derivado dos recebimentos consolidados.
- [x] Cobrança do saldo pelo WhatsApp em pedidos entregues, com chave Pix.
- [x] Alerta de margem com preço sugerido em produtos e nos itens do pedido; aviso de item sem custo registrado.
- [x] Repetir pedido a partir do pedido ou do histórico do cliente, com preços e custos atuais.
- [x] Aviso de cliente sem telefone.
- [ ] Custos indiretos (gás, energia, mão de obra) por configuração geral — aguarda decisão do modelo.
- [ ] Correção assistida de itens antigos com custo zero — exige confirmação do proprietário.

## Evolução — Etapa 2: base multiempresa
- [x] Cadastro da confeitaria (nome, slogan, WhatsApp, slug do catálogo) com RLS por dona.
- [x] Confeitaria criada automaticamente a cada novo cadastro; contas existentes preservam a marca atual.
- [x] Bloqueio de proprietária única substituído por `plataforma_config.cadastro_aberto` (fechado por padrão).
- [x] Marca e chave Pix configuráveis; nenhum nome de confeitaria fixo no código.
- [x] Teste de isolamento entre duas confeitarias (tabelas e RPCs) no CI.
- [ ] Aplicar `0033_base_multiempresa.sql` no banco do Lovable Cloud após backup (ver docs/deploy/README-multiempresa.md).
- [ ] Funcionários por confeitaria e numeração de pedidos por confeitaria.
