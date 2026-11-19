import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Confirmacao } from "./confirmar";
import { confirmar } from "@/lib/confirmar";

afterEach(() => vi.restoreAllMocks());

describe("confirmar", () => {
  it("abre a janela do app e responde true ao confirmar", async () => {
    render(<Confirmacao />);
    let resposta: Promise<boolean> = Promise.resolve(false);
    act(() => { resposta = confirmar({ titulo: "Excluir Bolo?", mensagem: "Não dá para desfazer.", acao: "Excluir", destrutivo: true }); });
    expect(await screen.findByText("Excluir Bolo?")).toBeInTheDocument();
    expect(screen.getByText("Não dá para desfazer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await expect(resposta).resolves.toBe(true);
  });

  it("responde false ao voltar", async () => {
    render(<Confirmacao />);
    let resposta: Promise<boolean> = Promise.resolve(true);
    act(() => { resposta = confirmar({ titulo: "Cancelar compra?" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Voltar" }));
    await expect(resposta).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("sem a janela montada, usa o diálogo do navegador em vez de pular a confirmação", async () => {
    const nativo = vi.spyOn(window, "confirm").mockReturnValue(false);
    await expect(confirmar({ titulo: "Sair?", mensagem: "Você perde o acesso." })).resolves.toBe(false);
    expect(nativo).toHaveBeenCalledWith("Sair?\n\nVocê perde o acesso.");
  });
});
