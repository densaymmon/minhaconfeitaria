// Monitoramento de erros de tela: envia para a administração (registrar_erro) os erros
// que acontecem no navegador. Ignora ruído conhecido e repetições na mesma página.
import type { SupabaseClient } from "@supabase/supabase-js";

export type OrigemErro = "app" | "catalogo" | "admin";

const RUIDO = [
  /ResizeObserver loop/i,
  /Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Non-Error promise rejection captured/i,
  /AbortError|The operation was aborted/i,
  /Load failed$|Failed to fetch$|NetworkError when attempting to fetch/i,
];

/** Texto curto do erro (mensagem) e detalhe (pilha). */
export function descreverErro(erro: unknown): { mensagem: string; detalhe: string | null } {
  if (erro instanceof Error) return { mensagem: `${erro.name}: ${erro.message}`.slice(0, 500), detalhe: (erro.stack ?? "").slice(0, 4000) || null };
  if (typeof erro === "string") return { mensagem: erro.slice(0, 500), detalhe: null };
  try { return { mensagem: JSON.stringify(erro).slice(0, 500), detalhe: null }; } catch { return { mensagem: String(erro).slice(0, 500), detalhe: null }; }
}

export function ehRuido(mensagem: string, detalhe?: string | null) {
  return RUIDO.some((r) => r.test(mensagem) || (detalhe ? r.test(detalhe) : false));
}

const enviados = new Set<string>();
const LIMITE_POR_PAGINA = 15;

export function registrarErro(supabase: SupabaseClient, origem: OrigemErro, erro: unknown) {
  try {
    if (typeof window === "undefined") return;
    const { mensagem, detalhe } = descreverErro(erro);
    if (!mensagem.trim() || ehRuido(mensagem, detalhe)) return;
    const chave = `${mensagem}|${window.location.pathname}`;
    if (enviados.has(chave) || enviados.size >= LIMITE_POR_PAGINA) return;
    enviados.add(chave);
    void supabase.rpc("registrar_erro", {
      p_origem: origem, p_mensagem: mensagem, p_detalhe: detalhe ?? "", p_url: window.location.href, p_agente: navigator.userAgent.slice(0, 300),
    }).then(() => undefined, () => undefined);
  } catch {
    /* o monitor nunca pode causar outro erro */
  }
}

/** Liga a captura de erros globais (uma vez). Devolve a função para desligar. */
export function ligarMonitorDeErros(supabase: SupabaseClient, origem: () => OrigemErro) {
  if (typeof window === "undefined") return () => undefined;
  const aoErro = (e: ErrorEvent) => registrarErro(supabase, origem(), e.error ?? e.message);
  const aoRejeitar = (e: PromiseRejectionEvent) => registrarErro(supabase, origem(), e.reason);
  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
  return () => { window.removeEventListener("error", aoErro); window.removeEventListener("unhandledrejection", aoRejeitar); };
}
