# Política de segurança

## Como reportar uma vulnerabilidade

Se você encontrou uma falha de segurança no Doce Gestão, **não abra uma issue pública**.

Envie os detalhes para: **[PREENCHER: e-mail de segurança do responsável pelo produto]**

Inclua, se possível: o que você encontrou, como reproduzir, qual dado ou função é afetado e o impacto que você imagina. Responderemos confirmando o recebimento em até **[PREENCHER: prazo, sugestão 3 dias úteis]**.

Pedimos que você não acesse dados de outras pessoas além do mínimo necessário para demonstrar o problema, não faça testes que degradem o serviço e nos dê tempo razoável para corrigir antes de divulgar.

## O que está no escopo

- O sistema das confeitarias, o catálogo público e o painel de administração da plataforma.
- Isolamento entre confeitarias (uma ver ou alterar dados de outra).
- Acesso anônimo a dados ou funções que não deveriam ser públicas.
- Cálculo de preços/valores no catálogo feito a partir de dados enviados pelo navegador.

## Fora do escopo

Ataques de negação de serviço volumétricos, engenharia social, falhas em serviços de terceiros (Lovable, Supabase, GitHub) — para esses, reporte ao fornecedor.

## Como a segurança é construída

Resumo para quem avalia o projeto (detalhes em `docs/arquitetura.md`):

- Toda tabela tem RLS por confeitaria; o papel anônimo não tem privilégio de tabela (exceto leitura dos planos).
- O catálogo público só usa funções específicas, que calculam preço, taxa e custo no servidor.
- Funções sensíveis filtram sempre pela confeitaria dona do dado, e há testes automáticos de isolamento no CI.
- Administração da plataforma é um site separado, com login próprio, e cada função administrativa confere se o usuário é administrador.
- Segredos não ficam no repositório (ver `.env.example`).
