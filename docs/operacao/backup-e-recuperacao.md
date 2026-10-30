# Backup e recuperação de desastre

> **Situação em 30/10/2026:** a configuração de backup do provedor **não foi verificada** e **nenhuma restauração foi testada**. Este documento define o que confirmar e como testar. Preencha a seção "Registro" quando fizer.

## Objetivos (definir e registrar)

| Item | Pergunta | Meta sugerida para o piloto |
|---|---|---|
| RPO | Quanto de dados posso perder, no máximo? | até 24 horas (backup diário) ou menos |
| RTO | Em quanto tempo preciso voltar a funcionar? | até 1 dia útil |

## O que confirmar no painel do provedor (Lovable Cloud / Supabase)

Ações do proprietário, no painel do projeto **Minhaconfeitaria**:

1. Existe backup automático ligado? Com que frequência e por quantos dias é retido?
2. Existe recuperação para um ponto no tempo (PITR)? Está incluída no plano contratado?
3. Os arquivos enviados (fotos do catálogo, referências de encomendas) são cobertos por esse backup? Em geral o backup de banco **não inclui** o conteúdo dos arquivos do Storage; confirme e, se não incluir, defina uma cópia separada.
4. Quem tem acesso ao painel (e-mails) e se a conta do proprietário usa verificação em duas etapas.

## Teste de restauração (fazer antes do piloto e repetir a cada trimestre)

1. Criar um projeto Supabase **separado** só para o teste.
2. Restaurar nele o backup mais recente (ou gerar uma cópia lógica do banco com `pg_dump` e restaurar com `psql`, usando a cadeia de conexão do projeto).
3. Conferir:
   - número de linhas de `pedidos`, `pedido_itens`, `clientes`, `produtos`, `insumos`, `pedido_pagamentos` iguais ao original;
   - login funciona e as políticas (RLS) estão presentes;
   - um pedido recente abre com itens e recebimentos corretos.
4. Registrar quanto tempo levou (isso é o RTO real) e o que faltou.
5. Apagar o projeto de teste, pois ele contém dados reais de clientes.

## Cópia extra feita pela própria dona

O sistema permite à confeiteira exportar todos os dados (cópia completa `.json` e planilha de pedidos) em Configurações. Oriente as donas a baixar uma cópia periodicamente. Isso **não substitui** o backup da plataforma.

## Se acontecer um desastre

1. Registre o horário e o que se sabe (ver `docs/operacao/incidentes.md`).
2. Se houver perda ou corrupção de dados: pare novas gravações bloqueando o acesso das confeitarias se necessário (o painel de administração permite bloquear).
3. Restaure para um projeto novo, valide como no teste acima e só então aponte o sistema para ele.
4. Avise as confeitarias afetadas.

## Registro dos testes

| Data | Quem | Backup usado | Tempo para restaurar | Resultado / pendências |
|---|---|---|---|---|
| _preencher_ | | | | |
