import { describe, expect, it } from "vitest";
import { filtrarContas, lerContas, mensalidadeVencida, resumoContas } from "./plataforma";
import { contato, responsavel, termosDeUso, politicaPrivacidade, dataVersao, TERMOS_VERSAO } from "./termos";

const contas = lerContas([
  { user_id: "a", nome: "Casal do Bolo", acesso: "ativo", admin: true, pago_ate: null, pedidos_total: "41", email: "dona@x.com" },
  { user_id: "b", nome: "Doces da Bia", acesso: "pendente", cidade: "Campinas", whatsapp: "19988887777" },
  { user_id: "c", nome: "Bolo & Cia", acesso: "ativo", pago_ate: "2026-10-01" },
  { user_id: "d", nome: "Torta Feliz", acesso: "bloqueado", pago_ate: "2026-09-01" },
  { user_id: "e", nome: "Brigadeiria", acesso: "ativo", pago_ate: "2026-11-30" },
  { nome: "sem id" },
  "lixo",
]);

describe("painel da plataforma", () => {
  it("lê a lista do servidor com tipos seguros", () => {
    expect(contas.length).toBe(5);
    expect(contas[0]?.pedidos_total).toBe(41);
    expect(contas[1]?.acesso).toBe("pendente");
    expect(contas[1]?.email).toBeNull();
  });
  it("marca mensalidade vencida só em conta ativa que não é da administração", () => {
    const hoje = "2026-10-28";
    expect(mensalidadeVencida({ acesso: "ativo", admin: false, pago_ate: "2026-10-27" }, hoje)).toBe(true);
    expect(mensalidadeVencida({ acesso: "ativo", admin: false, pago_ate: "2026-10-28" }, hoje)).toBe(false);
    expect(mensalidadeVencida({ acesso: "bloqueado", admin: false, pago_ate: "2026-01-01" }, hoje)).toBe(false);
    expect(mensalidadeVencida({ acesso: "ativo", admin: true, pago_ate: "2026-01-01" }, hoje)).toBe(false);
    expect(mensalidadeVencida({ acesso: "ativo", admin: false, pago_ate: null }, hoje)).toBe(false);
  });
  it("filtra por situação e busca por nome, cidade ou contato", () => {
    const hoje = "2026-10-28";
    expect(filtrarContas(contas, "pendente", "", hoje).map((c) => c.user_id)).toEqual(["b"]);
    expect(filtrarContas(contas, "vencidas", "", hoje).map((c) => c.user_id)).toEqual(["c"]);
    expect(filtrarContas(contas, "todas", "campinas", hoje).map((c) => c.user_id)).toEqual(["b"]);
    expect(filtrarContas(contas, "todas", "DONA@", hoje).map((c) => c.user_id)).toEqual(["a"]);
    expect(resumoContas(contas, hoje)).toEqual({ total: 5, pendente: 1, ativo: 3, bloqueado: 1, vencidas: 1 });
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
