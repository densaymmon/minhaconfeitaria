# Finalização
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

## Correções de build
- [x] Remover a tela incompleta de compras e estoque e as consultas que apontavam para tabelas inexistentes; a função continua registrada em memória para ser construída no formato aprovado (data, insumos, quantidade com medida, preço por item e total).
- [x] Alinhar o teste de status ao rótulo atual "Entregue" e corrigir os vínculos e parâmetros de busca de painel, pedidos e produtos.
- [x] Validar com 21 testes, build sem erros de typecheck e navegação autenticada: vínculo do painel abre o filtro ativo, duplicar produto abre a receita com "(cópia)" e o menu "Mais" sem a tela removida.
