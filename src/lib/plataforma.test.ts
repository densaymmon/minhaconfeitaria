import { describe, expect, it } from "vitest";
import { filtrarEmpresas, lerEmpresas, lerPagamentos, lerResumo, previsaoPagoAte, riscoDeCancelamento, situacaoExibida } from "./plataforma";
import { contato, responsavel, termosDeUso, politicaPrivacidade, dataVersao, TERMOS_VERSAO } from "./termos";

const empresas = lerEmpresas([
  { user_id: "a", nome: "Casal do Bolo", acesso: "ativo", situacao: "cortesia", situacao_cadastrada: "cortesia", plano_nome: "Vitrine", pedidos_total: "41", email: "dona@x.com" },
  { user_id: "b", nome: "Doces da Bia", acesso: "pendente", situacao: "teste", cidade: "Campinas", whatsapp: "19988887777" },
  { user_id: "c", nome: "Bolo & Cia", acesso: "ativo", situacao: "atrasada", situacao_cadastrada: "ativa", pago_ate: "2026-10-25", valor_efetivo: 59.9 },
  { user_id: "d", nome: "Torta Feliz", acesso: "bloqueado", situacao: "ativa" },
  { user_id: "e", nome: "Brigadeiria", acesso: "ativo", situacao: "teste", situacao_cadastrada: "teste", teste_ate: "2026-11-05", ciclo: "anual" },
  { user_id: "f", nome: "Doceria", acesso: "ativo", situacao: "suspensa" },
  { nome: "sem id" },
  "lixo",
]);

describe("painel de administração", () => {
  it("lê a lista do servidor com tipos seguros", () => {
    expect(empresas.length).toBe(6);
    expect(empresas[0]?.pedidos_total).toBe(41);
    expect(empresas[2]?.valor_efetivo).toBe(59.9);
    expect(empresas[4]?.ciclo).toBe("anual");
    expect(empresas[1]?.email).toBeNull();
    expect(empresas[3]?.plano_id).toBeNull();
  });
  it("mostra primeiro o acesso manual e depois a assinatura", () => {
    expect(situacaoExibida({ acesso: "pendente", situacao: "teste" }).rotulo).toBe("Aguardando liberação");
    expect(situacaoExibida({ acesso: "bloqueado", situacao: "ativa" }).rotulo).toBe("Bloqueada");
    expect(situacaoExibida({ acesso: "ativo", situacao: "atrasada" }).tom).toBe("alerta");
    expect(situacaoExibida({ acesso: "ativo", situacao: null }).rotulo).toBe("Sem plano");
  });
  it("filtra por situação e busca", () => {
    const ids = (f: Parameters<typeof filtrarEmpresas>[1], q = "") => filtrarEmpresas(empresas, f, q).map((e) => e.user_id);
    expect(ids("pendentes")).toEqual(["b"]);
    expect(ids("teste")).toEqual(["e"]);
    expect(ids("atrasadas")).toEqual(["c"]);
    expect(ids("suspensas")).toEqual(["f"]);
    expect(ids("bloqueadas")).toEqual(["d"]);
    expect(ids("cortesia")).toEqual(["a"]);
    expect(ids("todas", "campinas")).toEqual(["b"]);
    expect(ids("todas", "VITRINE")).toEqual(["a"]);
  });
  it("prevê o novo vencimento como o banco", () => {
    // Em teste: o período pago começa no fim do teste.
    expect(previsaoPagoAte({ situacao_cadastrada: "teste", teste_ate: "2026-11-05", pago_ate: null }, "2026-10-28", 1)).toBe("2026-12-05");
    // Atrasada há poucos dias: conta do vencimento anterior.
    expect(previsaoPagoAte({ situacao_cadastrada: "ativa", teste_ate: null, pago_ate: "2026-10-20", }, "2026-10-28", 1)).toBe("2026-11-20");
    // Muito atrasada: conta da data do pagamento.
    expect(previsaoPagoAte({ situacao_cadastrada: "ativa", teste_ate: null, pago_ate: "2026-08-01" }, "2026-10-28", 12)).toBe("2027-10-28");
    // Fim de mês.
    expect(previsaoPagoAte({ situacao_cadastrada: "ativa", teste_ate: null, pago_ate: "2026-01-31" }, "2026-01-30", 1)).toBe("2026-02-28");
  });
  it("lê resumo e pagamentos", () => {
    expect(lerResumo({ total: 3, receita_mensal: "149.80" }).receita_mensal).toBe(149.8);
    expect(lerResumo(null).total).toBe(0);
    expect(lerPagamentos([{ id: "1", valor: "59.90", pago_em: "2026-10-28", meses: 1, pago_ate_novo: "2026-11-28", user_id: "c" }, {}])[0]?.valor).toBe(59.9);
  });
});

describe("termos", () => {
  const p = { cadastro_aberto: true, aprovacao_manual: true, empresa_nome: "Dennys Gestão", empresa_documento: "12.345.678/0001-90", contato_email: "oi@docegestao.com", contato_whatsapp: null };
  it("usa o responsável e o contato cadastrados", () => {
    expect(responsavel(p)).toBe("Dennys Gestão (CPF/CNPJ 12.345.678/0001-90)");
    expect(contato(p)).toBe("e-mail oi@docegestao.com");
    expect(contato({ ...p, contato_whatsapp: "(19) 99999-0000" })).toBe("e-mail oi@docegestao.com ou WhatsApp (19) 99999-0000");
    expect(termosDeUso(p)[0]?.paragrafos[0]).toContain("Dennys Gestão");
  });
  it("tem texto padrão sem dados cadastrados", () => {
    expect(responsavel(null)).toBe("os responsáveis pela plataforma Doce Gestão");
    expect(contato(null)).toContain("canais de atendimento");
    expect(politicaPrivacidade(null).length).toBeGreaterThan(5);
    expect(dataVersao(TERMOS_VERSAO)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("risco de cancelamento", () => {
  const base = { acesso: "ativo" as const, situacao: "ativa" as const, teste_ate: null, pedidos_total: 20, ultimo_acesso: "2026-10-27T10:00:00Z", criado_em: "2026-08-01T10:00:00Z" };
  it("aponta atraso, teste parado e falta de uso", () => {
    expect(riscoDeCancelamento({ ...base, situacao: "atrasada" }, undefined, "2026-10-28")).toBe("Mensalidade atrasada");
    expect(riscoDeCancelamento({ ...base, situacao: "teste", teste_ate: "2026-10-30", pedidos_total: 1 }, { ultimo_pedido: "2026-10-27T10:00:00Z" }, "2026-10-28")).toBe("Teste acaba em 2 dia(s) com pouco uso");
    expect(riscoDeCancelamento(base, { ultimo_pedido: "2026-10-01T10:00:00Z" }, "2026-10-28")).toBe("Sem pedidos há 27 dias");
    expect(riscoDeCancelamento(base, { ultimo_pedido: null }, "2026-10-28")).toBe("Nenhum pedido em 88 dias de conta");
    expect(riscoDeCancelamento({ ...base, ultimo_acesso: "2026-10-01T10:00:00Z" }, { ultimo_pedido: "2026-10-27T10:00:00Z" }, "2026-10-28")).toBe("Sem entrar há 27 dias");
  });
  it("não alerta quem está usando ou quem não está liberado", () => {
    expect(riscoDeCancelamento(base, { ultimo_pedido: "2026-10-27T10:00:00Z" }, "2026-10-28")).toBeNull();
    expect(riscoDeCancelamento({ ...base, acesso: "pendente" }, undefined, "2026-10-28")).toBeNull();
    expect(riscoDeCancelamento({ ...base, situacao: "cancelada" }, undefined, "2026-10-28")).toBeNull();
  });
});
