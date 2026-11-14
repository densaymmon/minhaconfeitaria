# Conformidade: LGPD, consumidor e negócios

Auditoria de 13/11/2026. Complementa `docs/conformidade-seguranca-lgpd.md` (segurança e produção).
**Situação:** ✅ atendido · 🛠 corrigido neste PR (texto em `src/lib/termos.ts`, versão `2026-11-13`) · 🟡 parcial · ⬜ depende de decisão do proprietário, do advogado ou de migração de banco.

> Os textos são um **rascunho técnico** baseado no que o sistema realmente faz. Prazos e compromissos (30 dias para excluir, 7 dias de desistência, 30 dias de aviso de reajuste, teste de 14 dias, tolerância de 7 dias) são decisões de negócio: confirme com o advogado antes do piloto. Ao mesclar, todas as confeitarias terão de aceitar os termos de novo (mudança de `TERMOS_VERSAO`).

## LGPD e privacidade

| Item | Situação | Evidência / o que foi feito | Falta |
|---|---|---|---|
| Política de Privacidade | 🛠 | `/privacidade` reescrita em 11 seções: quem somos, dados e finalidades, controladora/operadora, minimização, compartilhamento, cookies, retenção, direitos, segurança, crianças, alterações. | Revisão do advogado. |
| Bases legais | 🛠 | Cada tratamento tem sua base (contrato, obrigação legal, legítimo interesse, consentimento para push). | Advogado confirma, em especial o legítimo interesse. |
| Minimização de dados | 🛠 | Catálogo pede só nome, WhatsApp, forma de receber e endereço na entrega; sem CPF nem data de nascimento. Texto agora declara isso. URLs de erro sem códigos de pedido (PR de segurança). | Revisar se algum campo livre incentiva dado sensível. |
| Finalidades documentadas | 🛠 | Seção 2 da política lista finalidade por tipo de dado. Aviso curto de uso dos dados na tela "Seus dados" do catálogo, com link para a política. | — |
| Gestão de consentimento | 🟡 | Aceite dos termos no cadastro e a cada nova versão, com data e versão registradas (`aceitar_termos`). Push só após permissão do navegador. | Se um dia houver marketing por WhatsApp/e-mail, criar consentimento separado e revogável. |
| Política de Cookies | 🛠 | Seção 6 da política: o que é guardado no navegador (login, carrinho, preferências, recuperação de senha), sem cookies de publicidade ou rastreamento. Sem banner, pois só há armazenamento essencial. | Se entrar qualquer ferramenta de estatística ou anúncio, será preciso banner e consentimento. |
| Direitos dos titulares | 🛠 | Seção 8: lista dos direitos, como pedir, resposta em até 15 dias, encaminhamento à confeitaria quando é o caso, reclamação à ANPD. | ⬜ Preencher e-mail/WhatsApp de contato em Plataforma → Configurações (o texto usa esses campos). Rotina interna para atender pedidos (quem responde, como apaga). |
| Exclusão de dados | 🟡 | Texto promete exclusão ou anonimização em até 30 dias após o encerramento. Hoje é **manual**, a pedido. Exportação já existe em Configurações. | ⬜ Migração e tela de autoatendimento (fila de solicitações + rotina que apaga/anonimiza, preservando o que a lei manda guardar). |
| Retenção de dados | 🛠 | Seção 7: conta ativa; 30 dias após encerramento; fiscais/financeiros conforme lei; erros 30 dias (já aplicado no banco); cópias de segurança no ciclo do provedor. | Confirmar prazos de backup do provedor e quais registros fiscais a confeitaria precisa guardar (contador). |
| Contratos com operadores | 🟡 | A política cita os operadores (Lovable Cloud/Supabase, provedor de IA, CDNs, push dos navegadores). | ⬜ Anexar/arquivar os termos de tratamento de dados (DPA) dos fornecedores; contrato de assinatura entre plataforma (operadora) e confeitaria (controladora). |

## Consumidor e negócios

| Item | Situação | Evidência / o que foi feito | Falta |
|---|---|---|---|
| Termos de Uso | 🛠 | `/termos` com 11 seções, incluindo catálogo/publicidade, IA, licença e encerramento. Link também no rodapé do catálogo. | Revisão do advogado. |
| Transparência de preços | ✅ | Preço, taxa e total calculados no servidor e exibidos antes do envio; termos obrigam informar tudo antes do pedido. | — |
| Cobranças transparentes | 🛠 | Termos: valor informado antes da contratação, sem débito automático hoje, tolerância informada, aviso de 30 dias para reajuste. | ⬜ Quando houver cobrança automática (Pix/cartão), atualizar o texto. |
| Cancelamento de assinaturas | 🛠 | Termos: cancelamento a qualquer momento, sem multa, acesso até o fim do período pago. | ⬜ Não há botão "cancelar" no sistema: o pedido é pelo canal de contato (a administração cancela no painel). Avaliar botão de autoatendimento. |
| Política de reembolso | 🛠 | Termos: desistência em até 7 dias corridos do primeiro pagamento com devolução; sem devolução proporcional depois, salvo falha grave. | Decisão do proprietário e advogado. |
| Identificação do fornecedor | 🟡 | Termos mostram nome e CPF/CNPJ da plataforma (se configurados) e contato. Catálogo mostra "Vendido por [confeitaria]" e WhatsApp. | ⬜ Preencher empresa/CNPJ em Plataforma → Configurações. ⬜ Campo de CPF/CNPJ e endereço da confeitaria no catálogo (exige migração; a lei do e-commerce pede esses dados). |
| Publicidade transparente | 🛠 | Termos exigem informações claras e verdadeiras no catálogo, sem publicidade enganosa. | — |
| Depoimentos autênticos | ✅ | Avaliações só de pedidos entregues, confeitaria não edita texto/nota; termos proíbem avaliação falsa e ocultar só as negativas. A página de vendas não tem depoimentos. | Se a confeitaria oculta avaliações pelo painel, considerar mostrar a nota média de todas. |
| Licenças de uso | 🛠 | Termos seção 8: licença de uso limitada à plataforma; dados e conteúdo continuam da confeitaria. | ⬜ Arquivo de licença do código no repositório: decidir (código fechado ou não). O repositório está **público**. |
| Transparência sobre IA | 🛠 | Termos seção 7 e política: onde há IA, que dado é enviado, revisão humana obrigatória antes de salvar; leitura de notas é local. A tela já avisa que consome créditos e envia a mensagem. | — |
