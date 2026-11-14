// Termos de uso e política de privacidade da plataforma Doce Gestão.
// Ao mudar o texto de forma relevante, troque TERMOS_VERSAO: as confeitarias
// verão o aviso para aceitar a nova versão na próxima vez que entrarem.
//
// ATENÇÃO: prazos e compromissos (teste grátis, tolerância, exclusão em 30 dias, desistência em 7 dias)
// são as regras atuais do negócio e precisam de revisão por advogado antes do piloto.
// Quando o texto citar o que o sistema faz (IA, notificações, armazenamento no navegador),
// mude aqui junto com o código.

export const TERMOS_VERSAO = "2026-11-13";
export const NOME_PLATAFORMA = "Doce Gestão";

export type PlataformaPublica = {
  cadastro_aberto: boolean;
  aprovacao_manual: boolean;
  empresa_nome: string | null;
  empresa_documento: string | null;
  contato_email: string | null;
  contato_whatsapp: string | null;
  dias_teste?: number | null | undefined;
  dias_tolerancia?: number | null | undefined;
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

function diasTeste(p: PlataformaPublica | null | undefined) {
  return p?.dias_teste && p.dias_teste > 0 ? p.dias_teste : 14;
}
function diasTolerancia(p: PlataformaPublica | null | undefined) {
  return p?.dias_tolerancia && p.dias_tolerancia > 0 ? p.dias_tolerancia : 7;
}

export function termosDeUso(p: PlataformaPublica | null | undefined): Secao[] {
  const quem = responsavel(p);
  return [
    {
      titulo: "1. Sobre a plataforma e quem a opera",
      paragrafos: [
        `O ${NOME_PLATAFORMA} é um sistema on-line de gestão para confeitarias, operado por ${quem} ("plataforma"). Ele permite registrar pedidos, clientes, produtos, receitas, compras, estoque e finanças, e publicar um catálogo on-line onde os clientes da confeitaria fazem pedidos.`,
        `Ao criar uma conta, a pessoa que se cadastra ("confeitaria" ou "usuária") declara ter pelo menos 18 anos, ter poderes para representar o negócio cadastrado e concordar com estes termos e com a Política de Privacidade. Contato do fornecedor: ${contato(p)}.`,
      ],
    },
    {
      titulo: "2. Conta e acesso",
      paragrafos: [
        "Cada conta corresponde a uma confeitaria, com dados separados das demais. A usuária é responsável por manter a senha em segredo, por usar uma senha forte e exclusiva e por toda atividade feita com o seu login. Em caso de suspeita de acesso indevido, avise a plataforma imediatamente.",
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
      titulo: "4. Catálogo, preços, publicidade e avaliações",
      paragrafos: [
        "No catálogo, a confeitaria deve informar de forma clara o preço de cada produto, a taxa de entrega, descontos, o valor do sinal (quando houver) e o total antes de o cliente enviar o pedido. O sistema mostra o total calculado antes do envio; a confeitaria não deve cobrar valores diferentes do que foi informado.",
        "Ofertas, descrições, fotos, alergênicos e prazos publicados no catálogo são de responsabilidade da confeitaria e devem ser verdadeiros e claros, sem publicidade enganosa ou abusiva (Código de Defesa do Consumidor). A confeitaria deve informar ao cliente final a sua própria política de troca, cancelamento e devolução, e identificar-se (nome, contato e, quando exigido, CPF/CNPJ e endereço) como fornecedora dos produtos.",
        "As avaliações do catálogo só podem ser feitas por clientes com pedido entregue; a confeitaria não pode alterar o texto nem a nota. É proibido criar avaliações ou depoimentos falsos, pedir que terceiros os escrevam em seu nome ou ocultar de forma seletiva apenas as avaliações negativas para enganar os clientes.",
      ],
    },
    {
      titulo: "5. Pagamentos dos clientes da confeitaria",
      paragrafos: [
        "Os pagamentos feitos pelos clientes no catálogo (por exemplo, Pix) vão diretamente para a conta informada pela confeitaria. A plataforma não recebe, não guarda e não intermedeia esses valores, e não responde por pagamentos não feitos, devoluções ou disputas entre a confeitaria e seus clientes.",
        "Mensagens de WhatsApp são abertas no aparelho da própria confeitaria e enviadas por ela; a plataforma não envia mensagens em nome da confeitaria.",
      ],
    },
    {
      titulo: "6. Assinatura, preço, cancelamento e reembolso",
      paragrafos: [
        `O uso da plataforma pode estar sujeito a uma mensalidade. O valor de cada plano, o que ele inclui e a situação da assinatura aparecem no próprio sistema, e o valor é informado antes da contratação. Novas contas têm teste grátis de ${diasTeste(p)} dias. Hoje a cobrança é feita de forma combinada com a administração, sem débito automático, e nenhum valor é cobrado sem que a usuária tenha sido informada do preço.`,
        `Se um pagamento atrasar, o acesso continua por mais ${diasTolerancia(p)} dias corridos de tolerância; depois disso, o acesso pode ser bloqueado até a regularização. Os dados da confeitaria não são apagados pelo bloqueio por falta de pagamento.`,
        "A usuária pode cancelar a assinatura a qualquer momento, sem multa, pedindo pelos canais de contato. O acesso segue até o fim do período já pago. Em contratação feita a distância, a usuária pode desistir em até 7 dias corridos após o primeiro pagamento e receber de volta o valor pago. Fora desse prazo, não há devolução proporcional do período já usado, salvo falha grave do serviço atribuível à plataforma.",
        "Mudanças de preço serão avisadas com antecedência de pelo menos 30 dias e não valem para o período já pago.",
      ],
    },
    {
      titulo: "7. Inteligência artificial",
      paragrafos: [
        "Alguns recursos usam inteligência artificial, sempre acionados pela usuária. Hoje: o \"rascunho pela mensagem\", que envia o texto da mensagem do cliente que a usuária colar (e a lista de nomes dos seus produtos ativos) a um provedor de IA para sugerir os itens de um pedido. Não envie dados que não sejam necessários.",
        "A IA pode errar. O resultado é só uma sugestão: nada é salvo sem que a usuária revise e confirme, e a decisão e a responsabilidade pelo pedido continuam sendo da confeitaria. A leitura de notas e documentos de compra é feita no próprio aparelho, sem enviar o arquivo a um serviço de IA.",
      ],
    },
    {
      titulo: "8. Propriedade e licença de uso",
      paragrafos: [
        `O sistema, o código, a marca ${NOME_PLATAFORMA}, os textos e o layout pertencem à plataforma. Enquanto a conta estiver ativa, a usuária recebe uma licença de uso pessoal, não exclusiva, intransferível e revogável, só para gerir o próprio negócio. É proibido copiar, revender, sublicenciar, fazer engenharia reversa ou usar o sistema para criar um produto concorrente.`,
        "Os dados, fotos, logotipo e textos que a confeitaria cadastra continuam sendo dela. Ela autoriza a plataforma a armazená-los e exibi-los (por exemplo, no catálogo) apenas para prestar o serviço, e garante que tem direito de usá-los.",
      ],
    },
    {
      titulo: "9. Disponibilidade e limitação de responsabilidade",
      paragrafos: [
        "A plataforma é oferecida como está e pode passar por manutenções, atualizações e instabilidades. Fazemos o possível para mantê-la disponível e segura, mas não garantimos funcionamento ininterrupto ou livre de erros.",
        "Os cálculos de custo, preço, lucro e estoque dependem das informações cadastradas pela confeitaria e servem de apoio à gestão; a confeitaria deve conferir os valores antes de tomar decisões. Na máxima extensão permitida pela lei, a plataforma não responde por lucros cessantes ou prejuízos indiretos decorrentes do uso do sistema.",
      ],
    },
    {
      titulo: "10. Dados e encerramento da conta",
      paragrafos: [
        "Os dados cadastrados pertencem à confeitaria. Ela pode exportar a cópia completa e a planilha de pedidos em Configurações, e pedir o encerramento da conta e a exclusão dos dados pelos canais de contato abaixo. Após o pedido, os dados são excluídos ou anonimizados em até 30 dias, respeitados os prazos de guarda exigidos por lei (por exemplo, registros fiscais e financeiros), conforme a Política de Privacidade.",
      ],
    },
    {
      titulo: "11. Alterações e contato",
      paragrafos: [
        "Estes termos podem ser atualizados. Mudanças relevantes serão informadas no próprio sistema, e o uso continuado depende do aceite da nova versão. Registramos a data e a versão aceitas.",
        `Dúvidas e solicitações: ${contato(p)}. Estes termos são regidos pelas leis brasileiras.`,
      ],
    },
  ];
}

export function politicaPrivacidade(p: PlataformaPublica | null | undefined): Secao[] {
  const quem = responsavel(p);
  return [
    {
      titulo: "1. Quem somos e como falar com a gente",
      paragrafos: [
        `Esta política explica como o ${NOME_PLATAFORMA}, operado por ${quem}, trata dados pessoais, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).`,
        `Para qualquer assunto de privacidade, incluindo o contato com o encarregado pelo tratamento de dados: ${contato(p)}.`,
      ],
    },
    {
      titulo: "2. Quais dados tratamos, para quê e com que base legal",
      paragrafos: [
        "Confeitarias (usuárias do sistema): e-mail e senha de acesso (a senha é guardada de forma criptografada), nome da confeitaria, WhatsApp, cidade, endereço de retirada, chave Pix e dados de uso. Finalidades: criar e manter a conta, dar suporte e liberar ou bloquear o acesso. Base legal: execução do contrato (estes termos).",
        "Cobrança da assinatura e registros financeiros da plataforma. Base legal: execução do contrato e cumprimento de obrigação legal ou regulatória.",
        "Segurança e qualidade: registros de erros de tela (sem parâmetros do endereço) e histórico de alterações. Base legal: legítimo interesse em manter o serviço seguro e funcionando.",
        "Notificações de pedido novo no aparelho (push): identificador técnico do aparelho. Base legal: consentimento, dado quando você aceita a permissão do navegador. Você pode retirar o consentimento a qualquer momento nas configurações do navegador ou do aparelho.",
        "Recursos de IA: o texto que a usuária cola no \"rascunho pela mensagem\" é enviado, naquele momento, a um provedor de IA acessado por meio do Lovable AI, junto com os nomes dos produtos ativos. Base legal: execução do contrato, a pedido da usuária. Evite colar dados desnecessários.",
        "Clientes das confeitarias: nome, WhatsApp, endereço de entrega, itens, valores, observações, fotos de referência de encomendas e, se o cliente avaliar, nota, comentário e nome. Finalidade: atender o pedido e falar com o cliente sobre ele. Base legal: execução de contrato ou de procedimentos preliminares a pedido do cliente (a confeitaria é a controladora).",
      ],
    },
    {
      titulo: "3. Controladora e operadora",
      paragrafos: [
        "Para os dados das confeitarias, a plataforma é a controladora.",
        "Para os dados dos clientes das confeitarias, a confeitaria é a controladora: é ela quem decide como usá-los para atender o pedido. A plataforma atua como operadora, apenas armazenando e processando os dados por conta da confeitaria, sem vendê-los, compartilhá-los com terceiros para publicidade ou usá-los para outros fins.",
        "Clientes que quiserem acessar, corrigir ou excluir seus dados devem falar primeiro com a confeitaria onde fizeram o pedido. A plataforma ajuda a confeitaria a atender esses pedidos.",
      ],
    },
    {
      titulo: "4. Só o necessário (minimização)",
      paragrafos: [
        "O catálogo pede apenas o que é preciso para atender o pedido: nome, WhatsApp, data e forma de receber e, na entrega, o endereço. Não pedimos CPF, data de nascimento nem dados sensíveis dos clientes. Cada confeitaria só vê os dados da sua própria operação.",
        "Pedimos que as confeitarias também só cadastrem o necessário e não coletem dados sensíveis (saúde, religião etc.) nas observações. Alergias informadas pelo cliente servem só para preparar o pedido com segurança.",
      ],
    },
    {
      titulo: "5. Com quem os dados são compartilhados e onde ficam",
      paragrafos: [
        "Os dados ficam em serviços de banco de dados, autenticação e hospedagem em nuvem contratados pela plataforma (Lovable Cloud, com banco Supabase), que podem estar localizados fora do Brasil, com medidas de segurança adequadas e contrato com esses fornecedores (operadores) para tratar os dados só para prestar o serviço.",
        "Também recebem dados, quando você usa o recurso correspondente: o provedor de IA (texto do rascunho de pedido); os serviços de entrega de notificações dos navegadores (identificador do aparelho e o aviso de pedido); e redes de entrega de arquivos (CDN) que fornecem o leitor de notas de compra, que podem ver o endereço de rede (IP) do aparelho. O WhatsApp é aberto no aparelho da confeitaria e é regido pelas regras dele.",
        "Não vendemos dados nem os compartilhamos para publicidade. Podemos compartilhar dados quando exigido por lei ou por decisão de autoridade.",
        "A administração da plataforma vê apenas o necessário para gerir as contas (nome da confeitaria, contato, situação do acesso e totais de uso) e só acessa outros dados quando necessário para suporte solicitado pela confeitaria, por segurança ou por exigência legal.",
      ],
    },
    {
      titulo: "6. Cookies e armazenamento no navegador",
      paragrafos: [
        "Usamos apenas armazenamento estritamente necessário ao funcionamento, guardado no seu aparelho: sessão de login (para você continuar conectada), itens do carrinho do catálogo, preferências simples (por exemplo, dispensar a lista de primeiros passos e marcar itens da lista de compras) e um registro temporário durante a recuperação de senha.",
        "Não usamos cookies nem ferramentas de publicidade, de rastreamento de comportamento ou de estatísticas de terceiros. Por serem necessários, esses itens não pedem consentimento; você pode apagá-los nas configurações do navegador, mas então precisará entrar de novo e o carrinho será esvaziado. As notificações push só funcionam se você permitir, e podem ser desligadas a qualquer momento.",
      ],
    },
    {
      titulo: "7. Por quanto tempo guardamos",
      paragrafos: [
        "Dados da conta e da operação: enquanto a conta estiver ativa. Depois do encerramento a pedido da confeitaria, excluímos ou anonimizamos os dados em até 30 dias, exceto o que precisar ser guardado para cumprir obrigações legais (por exemplo, registros fiscais e financeiros por até 5 anos) ou para defesa em processos. Cópias de segurança do provedor podem conter os dados até serem substituídas no ciclo normal de renovação.",
        "Registros de erros de tela: 30 dias. Inscrições de notificação: até você desligá-las ou o aparelho deixar de responder. Pedidos de clientes: mantidos enquanto a conta da confeitaria estiver ativa; a confeitaria pode excluir ou anonimizar um cliente a pedido dele, ressalvadas as guardas legais.",
      ],
    },
    {
      titulo: "8. Seus direitos e como exercê-los",
      paragrafos: [
        "Você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; eliminação dos dados tratados com consentimento; informação sobre com quem compartilhamos; informação sobre a possibilidade de não consentir e suas consequências; e revogação do consentimento. Também pode pedir a revisão de decisões tomadas só por tratamento automatizado (não tomamos decisões automatizadas sobre você; a IA apenas sugere e a usuária decide).",
        `Como pedir: ${contato(p)}. Podemos pedir uma confirmação de identidade para proteger você. Respondemos em até 15 dias. Se o pedido for sobre dados de um pedido feito em uma confeitaria, encaminhamos à confeitaria, que é a controladora. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`,
        "A usuária pode exportar os próprios dados em Configurações (cópia completa e planilha de pedidos) e pedir o encerramento da conta e a eliminação dos dados.",
      ],
    },
    {
      titulo: "9. Segurança e incidentes",
      paragrafos: [
        "Adotamos medidas como conexão criptografada (HTTPS), senhas guardadas de forma irreversível, isolamento dos dados de cada confeitaria no banco de dados, permissões por função (gerente, produção), registro de alterações e monitoramento de erros. Nenhum sistema é totalmente imune, e pedimos que você use uma senha forte e exclusiva.",
        "Se houver um incidente de segurança que possa causar risco ou dano relevante, avisaremos as confeitarias afetadas e a ANPD, nos termos da LGPD, dizendo o que aconteceu, quais dados foram afetados e o que fazer.",
      ],
    },
    {
      titulo: "10. Crianças e adolescentes",
      paragrafos: [
        "O sistema é destinado a maiores de 18 anos que representam uma confeitaria. Não coletamos intencionalmente dados de crianças e adolescentes. Se você acredita que isso aconteceu, fale conosco para eliminarmos os dados.",
      ],
    },
    {
      titulo: "11. Alterações",
      paragrafos: [
        "Esta política pode ser atualizada. A versão em vigor fica sempre publicada nesta página, com a data. Mudanças relevantes são informadas no sistema.",
      ],
    },
  ];
}

/** Data da versão no formato dd/mm/aaaa. */
export function dataVersao(versao = TERMOS_VERSAO) {
  const [a, m, d] = versao.split("-");
  return a && m && d ? `${d}/${m}/${a}` : versao;
}
