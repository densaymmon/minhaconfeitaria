# Minhaconfeitaria

Crie um sistema web completo de gestão para minha confeitaria artesanal, em português brasileiro, com visual profissional, simples, moderno e otimizado para celular Android.



O sistema deve ter os seguintes módulos:



1. Painel inicial



- Total de pedidos do dia e do mês.

- Pedidos aguardando produção, em produção, prontos e entregues.

- Faturamento, custos e lucro do mês.

- Próximas entregas.



2. Cadastro de clientes



- Nome, telefone, endereço e observações.

- Histórico de pedidos e valores comprados.



3. Gestão de pedidos



- Número automático do pedido.

- Cliente, produtos, quantidades, valores e data de entrega.

- Valor de entrada, saldo restante e forma de pagamento.

- Status: recebido, confirmado, em produção, pronto, entregue e cancelado.

- Campo para observações e personalizações.

- Possibilidade de editar e localizar pedidos.



4. Controle de produção



- Lista dos pedidos que precisam ser produzidos.

- Agenda organizada por data de entrega.

- Identificação dos pedidos atrasados.

- Controle de quantidade produzida e pendente.



5. Cadastro de produtos e receitas



- Bolos caseiros, pães caseiros, pão italiano, baguetes recheadas e outros produtos.

- Ingredientes, quantidades e rendimento de cada receita.

- Custo dos ingredientes, embalagens, gás, energia e mão de obra.

- Possibilidade de atualizar os preços dos insumos.



6. Precificação e lucro



- Calcular automaticamente o custo de cada receita e produto.

- Permitir informar o preço de venda e a margem de lucro desejada.

- Calcular o lucro bruto e estimar o lucro líquido por pedido, descontando os custos e as taxas cadastradas.

- Mostrar o custo total, o valor vendido e o lucro de cada encomenda.



7. Relatórios financeiros



- Vendas por período e por produto.

- Despesas, recebimentos e valores a receber.

- Lucro por pedido e resultado mensal.

- Separar dinheiro recebido de lucro efetivamente obtido.



Requisitos técnicos:



- Interface em português e moeda brasileira (R$).

- Banco de dados persistente, para que os registros não desapareçam ao fechar o aplicativo.

- Login protegido para uso exclusivo do proprietário.

- Dados relacionados entre clientes, pedidos, produtos e receitas.

- Permitir exportar os registros para CSV ou Excel.

- Criar e testar as funções, não apenas desenhar as telas.

- Priorizar recursos gratuitos e informar claramente qualquer limitação ou cobrança antes de ativar serviços pagos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://minhaconfeitaria.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c2b2cdb7-59d4-4ac1-afc0-f3b8cdffb2cc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
