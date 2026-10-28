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

## Evolução — Etapa 3: catálogo online
- [x] Página pública do catálogo com carrinho, retirada/entrega, data mínima, pedido mínimo e limite diário.
- [x] Pedido criado no servidor (preço, taxa e custo do servidor; idempotente; limites contra abuso).
- [x] Acompanhamento do pedido com chave Pix e aviso de pagamento do cliente.
- [x] Configuração do catálogo, fotos e descrição dos produtos.
- [x] Alerta de pedido novo: contador no menu, som, aviso e notificação opcional.
- [ ] Aplicar `0034_catalogo_publico.sql` no banco (ver docs/deploy/README-catalogo.md).
- [ ] Pix automático por gateway (QR com valor e confirmação automática).

## Catálogo — fotos, links curtos e WhatsApp
- [x] Até 10 fotos e vídeos por produto, com ordem e capa; carrossel no catálogo.
- [x] Link curto do catálogo (/endereço), QR Code e compartilhar; acompanhamento em /p/código.
- [x] Confirmação do pedido no WhatsApp do cliente, enviada do número da confeitaria (mensagem pronta com itens, total, Pix e link).
- [ ] Envio automático pela API oficial do WhatsApp (depende de conta Meta e modelo de mensagem aprovado).

## Pix copia e cola e aviso de pedido pronto
- [x] Pix copia e cola (BR Code estático) com o valor em aberto e o número do pedido, sem gateway; tipo da chave e cidade nas configurações.
- [x] Aviso de pedido pronto no WhatsApp (lista, pedido e produção), com retirada/entrega, saldo, Pix e link; registro do envio.

## Variações de produto
- [x] Grupos de opções (tamanho, sabor, recheio) com acréscimo de preço e de custo, escolha obrigatória no catálogo, preço/custo/descrição calculados no servidor.

## Lista de produção do dia
- [x] Atalhos de período (Hoje, Amanhã, 7 dias, Tudo) na produção; "Hoje" inclui atrasados não entregues.
- [x] Ingredientes necessários para o que falta produzir (ficha técnica ÷ rendimento, em g/ml/un), comparados com o estoque, com "comprar X" e exportação em CSV.

## Pronto para outras confeitarias
- [x] Painel da plataforma (/plataforma): lista de confeitarias, liberar/bloquear, "mensalidade paga até" e anotações, abrir/fechar cadastro e aprovação manual.
- [x] Bloqueio aplicado no banco (política RESTRICTIVE em todas as tabelas); conta pendente/bloqueada não usa o sistema nem publica catálogo.
- [x] Cadastro com nome, WhatsApp e aceite dos termos; cadastro guiado (/comecar): confeitaria, Pix, catálogo e primeiro produto.
- [x] Termos de uso e política de privacidade (LGPD) em /termos e /privacidade, com responsável e contato configuráveis.
- [ ] Cobrança automática da mensalidade (gateway).
- [ ] Vários usuários (funcionários) por confeitaria.

## Planos, assinaturas e administração separada
- [x] Painel de administração separado (admin/, GitHub Pages) com login próprio: resumo e receita, empresas, assinatura, registro de pagamentos, planos e configurações.
- [x] Planos Essencial, Confeitaria e Vitrine com preço, limites e recursos editáveis; teste grátis de 14 dias; tolerância de 7 dias e suspensão automática.
- [x] No sistema da confeitaria: avisos de fim de teste/vencimento, tela de assinatura suspensa, recursos fora do plano trancados e "Meu plano" nas configurações.
- [ ] Cobrança automática (Pix/cartão por gateway) e recibo da mensalidade.

## Tela Hoje e página de vendas
- [x] Painel abre com "Hoje": entregas do dia, produção até amanhã, pedidos novos do catálogo, atrasados, avisar pronto e cobrar com um toque.
- [x] Página de vendas do Doce Gestão no endereço principal (funções, catálogo, planos do banco, dúvidas, teste grátis).

## Desempenho
- [x] Sessão lida do aparelho, cache de 60 s, pré-carregamento ao tocar e esqueleto nas telas.
- [x] Leitura dos pedidos sem gravação embutida (transição diária separada).
- [x] Botões de produção, status e avisos com atualização otimista.
- [x] Catálogo: busca antecipada, esqueleto e conexão antecipada com o banco.
- [ ] Carregar só pedidos recentes + em aberto (quando o histórico crescer).
- [ ] Fontes hospedadas no próprio site e fotos em tamanho reduzido na listagem.
- [x] Hoje e Produção carregam só pedidos em aberto + últimos 90 dias (histórico completo na lista, clientes e relatórios).
- [x] Fontes servidas pelo próprio site; miniaturas das fotos na lista do catálogo.

## Rotina e relacionamento
- [x] Lembrete da véspera no Hoje (WhatsApp com horário, local, itens e saldo; registra o envio).
- [x] Resumo do mês (/resumo-mes): vendas, custos, despesas, lucro, produtos que mais dão lucro e comparação com o mês anterior.
- [x] Clientes para reativar (30/45/60/90 dias sem comprar) com mensagem pronta e link do catálogo.
- [x] Exportar todos os dados (cópia completa .json e planilha de pedidos).

## Catálogo completo
- [x] Agenda: dias da semana sem atendimento, datas bloqueadas e horários de retirada.
- [x] Logo e cor da marca no catálogo.
- [x] Taxa de entrega por bairro (bairros fora da lista não recebem entrega).
- [x] Cupons de desconto (% ou R$, mínimo, validade, limite de usos, só primeira compra).
- [x] Encomenda personalizada com fotos de referência ("aguardando orçamento").

## Notificações
- [x] App instalável (ícone na tela inicial) e aviso de pedido novo/orçamento no celular mesmo com o sistema fechado, com botão de teste e lista de aparelhos.

## Equipe
- [x] Vários usuários por confeitaria: convite por link (WhatsApp), papéis Gerente e Produção, cadastro pelo convite mesmo com cadastro fechado, remover/alterar papel e sair da equipe.

## Vendas e gestão (2ª rodada)
- [x] Limite por produto e por dia; produtos sazonais; kits; sinal para confirmar; fidelidade; avaliações.
- [x] Agenda da semana; lista de compras com embalagens e custo; entregas do dia com rota; etiquetas com validade e alergênicos.
- [x] Alerta de margem no Hoje; fluxo de caixa por semana; meta do mês; histórico de quem fez o quê.
- [x] Métricas de uso e risco de cancelamento no painel de administração; monitoramento de erros; primeiros passos guiados.
