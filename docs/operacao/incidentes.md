# Resposta a incidentes

Use quando houver suspeita de acesso indevido a dados, vazamento, conta invadida, perda de dados ou sistema fora do ar.

> Este é um roteiro técnico, não aconselhamento jurídico. Para obrigações da LGPD (comunicação à ANPD e aos titulares, prazos), consulte um advogado.

## 1. Conter (primeira hora)

- **Conta de confeitaria comprometida:** bloqueie o acesso da confeitaria no painel de administração (os dados não são apagados) e peça redefinição de senha.
- **Conta de administrador da plataforma comprometida:** redefina a senha, encerre as sessões, remova o e-mail de `plataforma_admin_emails` se necessário e revise o que foi feito.
- **Segredo vazado** (chave de serviço do banco, segredo do cron, chave de IA): gere um novo no provedor e atualize o ambiente. O segredo do cron tem rotação: coloque o novo em `LOVABLE_CRON_SECRET` e mantenha o antigo em `LOVABLE_CRON_SECRET_PREVIOUS` até todas as chamadas migrarem. A chave pública do Supabase não é segredo.
- **Falha de isolamento** (uma confeitaria vendo dados de outra): feche novos cadastros (`plataforma_config.cadastro_aberto = false`) e considere bloquear o acesso até corrigir.

## 2. Entender

Reúna, sem apagar nada: horário de início, quais confeitarias e quais dados (nomes, telefones e endereços de clientes? valores financeiros?), como aconteceu, e se ainda está acontecendo. Fontes: `historico` (quem alterou o quê), `erros_app`, logs do provedor e do GitHub.

## 3. Corrigir

Faça a correção em um PR com teste que reproduza o problema (de preferência em `tests/db/`). Não reescreva histórico do Git.

## 4. Comunicar

- Avise as confeitarias afetadas com linguagem simples: o que aconteceu, que dados, o que foi feito, o que elas devem fazer.
- Verifique com um advogado se há obrigação de comunicar à ANPD e aos titulares dos dados e em que prazo.

## 5. Aprender

Registre uma análise curta: causa, impacto, linha do tempo, o que mudou para não repetir, e o teste automático adicionado.

## Registro de incidentes

| Data | Resumo | Impacto | Ações | Aprendizado |
|---|---|---|---|---|
| _nenhum registrado_ | | | | |
