import { describe, expect, it } from "vitest";
import { SENHA_TAMANHO_MINIMO, validarSenha } from "./senha";

describe("validarSenha", () => {
  it("rejeita senha curta", () => {
    expect(validarSenha("abc12345")).toContain(String(SENHA_TAMANHO_MINIMO));
  });
  it("rejeita senhas comuns e repetidas", () => {
    expect(validarSenha("1234567890")).toMatch(/comum/);
    expect(validarSenha("Confeitaria123")).toMatch(/comum/);
    expect(validarSenha("aaaaaaaaaaaa")).toMatch(/comum/);
  });
  it("rejeita senha que contém a parte inicial do e-mail", () => {
    expect(validarSenha("maria.bolos2026!", "maria.bolos@gmail.com")).toMatch(/e-mail/);
  });
  it("aceita uma senha razoável", () => {
    expect(validarSenha("Bolo-de-cenoura#42", "ana@gmail.com")).toBeNull();
    expect(validarSenha("tres cavalos brancos", null)).toBeNull();
  });
  it("não confunde e-mail curto com senha", () => {
    expect(validarSenha("umasenhaboa99", "a@b.com")).toBeNull();
  });
});
