// Termos de uso e política de privacidade da plataforma Doce Gestão.
// Ao mudar o texto de forma relevante, troque TERMOS_VERSAO: as confeitarias
// verão o aviso para aceitar a nova versão na próxima vez que entrarem.

export const TERMOS_VERSAO = "2026-10-28";
export const NOME_PLATAFORMA = "Doce Gestão";

export type PlataformaPublica = {
  cadastro_aberto: boolean;
  aprovacao_manual: boolean;
  empresa_nome: string | null;
  empresa_documento: string | null;
  contato_email: string | null;
  contato_whatsapp: string | null;
};

export type Secao = { titulo: string; paragrafos: string[] };

/** Nome de quem opera a plataforma, com documento quando houver. */
export function responsavel(p: PlataformaPublica | null | undefined) {
  const nome = p?.empresa_nome?.trim();
  if (!nome) return `os responsáveis pela plataforma ${NOME_PLATAFORMA}`;
  const doc = p?.empresa_documento?.trim();
  return doc ? `${nome} (CPF/CNPJ ${doc})` : nome;
}

/** Formas de contato publicadas pela administração. */
export function contato(p: PlataformaPublica | null | undefined) {
  const email = p?.contato_email?.trim() ?? "";
  const whatsapp = p?.contato_whatsapp?.trim() ?? "";
  const formas = [email ? `e-mail ${email}` : null, whatsapp ? `WhatsApp ${whatsapp}` : null].filter(Boolean);
  return formas.length > 0 ? formas.join(" ou ") : "os canais de atendimento informados pela plataforma";
}

export function termosDeUso(p: PlataformaPublica | null | undefined): Secao[] {
  const quem = responsavel(p);
  return [
    {
      titulo: "1. Sobre a plataforma",
      paragrafos: [
        `O ${NOME_PLATAFORMA} é um sistema on-line de gestão para confeitarias, operado por ${quem} ("plataforma"). Ele permite registrar pedidos, clientes, produtos, receitas, compras, estoque e finanças, e publicar um catálogo on-line onde os clientes da confeitaria fazem pedidos.`,
        `Ao criar uma conta, a pessoa que se cadastra ("confeitaria" ou "usuária") declara ter pelo menos 18 anos, ter poderes para representar o negócio cadastrado e concordar com estes termos e com a Política de Privacidade.`,
      ],
    },
    {
      titulo: "2. Conta e acesso",
      paragrafos: [
        "Cada conta corresponde a uma confeitaria, com dados separados das demais. A usuária é responsável por manter a senha em segredo e por toda atividade feita com o seu login.",
        "Novas contas podem depender de liberação pela administração da plataforma. A plataforma pode suspender ou bloquear uma conta em caso de falta de pagamento, uso indevido, violação destes termos ou da lei, ou risco à segurança, avisando a usuária sempre que possível.",
      ],
    },
    {
      titulo: "3. Responsabilidades da confeitaria",
      paragrafos: [
        "A confeitaria é a única responsável pelas informações que cadastra, pelos produtos que vende, pelos preços, pela entrega, pela emissão de documentos fiscais, pelo atendimento aos seus clientes e pelo cumprimento das normas sanitárias, de defesa do consumidor e tributárias aplicáveis ao seu negócio.",
        "A confeitaria só deve cadastrar dados de clientes que tenha obtido de forma legítima e usá-los para atender pedidos e se comunicar com esses clientes, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).",
        "É proibido usar a plataforma para atividades ilegais, enviar conteúdo ofensivo ou que viole direitos de terceiros, tentar acessar dados de outras confeitarias ou prejudicar o funcionamento do sistema.",
      ],
    },
    {
      titulo: "4. Pagamentos dos clientes da confeitaria",
      paragrafos: [
        "Os pagamentos feitos pelos clientes no catálogo (por exemplo, Pix) vão diretamente para a conta informada pela confeitaria. A plataforma não recebe, não guarda e não intermedeia esses valores, e não responde por pagamentos não feitos, devoluções ou disputas entre a confeitaria e seus clientes.",
        "Mensagens de WhatsApp são abertas no aparelho da própria confeitaria e enviadas por ela; a plataforma não envia mensagens em nome da confeitaria.",
      ],
    },
    {
      titulo: "5. Assinatura",
      paragrafos: [
        "O uso da plataforma pode estar sujeito a uma mensalidade, com valor, forma e data de pagamento combinados com a administração. A falta de pagamento pode levar ao bloqueio do acesso até a regularização. Os dados da confeitaria não são apagados pelo bloqueio por falta de pagamento.",
      ],
    },
    {
      titulo: "6. Disponibilidade e limitação de responsabilidade",
      paragrafos: [
        "A plataforma é oferecida como está e pode passar por manutenções, atualizações e instabilidades. Fazemos o possível para mantê-la disponível e segura, mas não garantimos funcionamento ininterrupto ou livre de erros.",
        "Os cálculos de custo, preço, lucro e estoque dependem das informações cadastradas pela confeitaria e servem de apoio à gestão; a confeitaria deve conferir os valores antes de tomar decisões. Na máxima extensão permitida pela lei, a plataforma não responde por lucros cessantes ou prejuízos indiretos decorrentes do uso do sistema.",
      ],
    },
    {
      titulo: "7. Dados e encerramento da conta",
      paragrafos: [
        "Os dados cadastrados pertencem à confeitaria. Ela pode exportar relatórios disponíveis no sistema e pedir o encerramento da conta e a exclusão dos dados pelos canais de contato abaixo, respeitados os prazos de guarda exigidos por lei.",
      ],
    },
    {
      titulo: "8. Alterações e contato",
      paragrafos: [
        "Estes termos podem ser atualizados. Mudanças relevantes serão informadas no próprio sistema, e o uso continuado depende do aceite da nova versão.",
        `Dúvidas e solicitações: ${contato(p)}. Estes termos são regidos pelas leis brasileiras.`,
      ],
    },
  ];
}

export function politicaPrivacidade(p: PlataformaPublica | null | undefined): Secao[] {
  const quem = responsavel(p);
  return [
    {
      titulo: "1. Quem somos",
      paragrafos: [
        `Esta política explica como o ${NOME_PLATAFORMA}, operado por ${quem}, trata dados pessoais, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).`,
      ],
    },
    {
      titulo: "2. Dados das confeitarias (usuárias do sistema)",
      paragrafos: [
        "Coletamos o e-mail e a senha de acesso (guardada de forma criptografada), o nome da confeitaria, WhatsApp, cidade, endereço de retirada, chave Pix e as informações de uso do sistema. Usamos esses dados para criar e manter a conta, dar suporte, liberar ou bloquear o acesso, cobrar a assinatura e manter a segurança.",
        "Para esses dados, a plataforma é a controladora. A base legal é a execução do contrato (estes termos), o cumprimento de obrigações legais e o legítimo interesse em manter o serviço seguro.",
      ],
    },
    {
      titulo: "3. Dados dos clientes das confeitarias",
      paragrafos: [
        "Quando uma confeitaria cadastra clientes ou recebe pedidos pelo catálogo, o sistema guarda nome, WhatsApp, endereço de entrega, itens, valores e observações do pedido.",
        "Para esses dados, a confeitaria é a controladora: é ela quem decide como usá-los para atender o pedido e falar com o cliente. A plataforma atua como operadora, apenas armazenando e processando os dados por conta da confeitaria, sem vendê-los, compartilhá-los com terceiros para publicidade ou usá-los para outros fins.",
        "Clientes que quiserem acessar, corrigir ou excluir seus dados devem falar primeiro com a confeitaria onde fizeram o pedido. A plataforma ajuda a confeitaria a atender esses pedidos.",
      ],
    },
    {
      titulo: "4. Onde os dados ficam e quem tem acesso",
      paragrafos: [
        "Os dados ficam em serviços de banco de dados e hospedagem em nuvem contratados pela plataforma, que podem estar localizados fora do Brasil, com medidas de segurança adequadas. Cada confeitaria só acessa os próprios dados; o isolamento é aplicado no banco de dados.",
        "A administração da plataforma vê apenas o necessário para gerir as contas (nome da confeitaria, contato, situação do acesso e totais de uso) e só acessa outros dados quando necessário para suporte solicitado pela confeitaria, por segurança ou por exigência legal.",
      ],
    },
    {
      titulo: "5. Cookies e armazenamento no navegador",
      paragrafos: [
        "Usamos armazenamento do navegador apenas para manter o login, lembrar preferências e o carrinho do catálogo. Não usamos cookies de publicidade.",
      ],
    },
    {
      titulo: "6. Por quanto tempo guardamos",
      paragrafos: [
        "Os dados são mantidos enquanto a conta estiver ativa. Após o encerramento a pedido da confeitaria, os dados são excluídos em prazo razoável, exceto o que precisar ser guardado para cumprir obrigações legais ou para defesa em processos.",
      ],
    },
    {
      titulo: "7. Seus direitos",
      paragrafos: [
        "Você pode pedir confirmação de tratamento, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, informações sobre compartilhamento e revisão do consentimento, nos termos da LGPD. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
        `Para exercer seus direitos ou tirar dúvidas: ${contato(p)}.`,
      ],
    },
    {
      titulo: "8. Alterações",
      paragrafos: [
        "Esta política pode ser atualizada. A versão em vigor fica sempre publicada nesta página.",
      ],
    },
  ];
}

/** Data da versão no formato dd/mm/aaaa. */
export function dataVersao(versao = TERMOS_VERSAO) {
  const [a, m, d] = versao.split("-");
  return a && m && d ? `${d}/${m}/${a}` : versao;
}
