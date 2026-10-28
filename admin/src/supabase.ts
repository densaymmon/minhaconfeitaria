import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const chave = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
if (!url || !chave) throw new Error("Configuração do banco ausente (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).");

// Sessão própria do painel, separada da sessão do sistema das confeitarias.
export const supabase = createClient<Database>(url, chave, {
  auth: { storageKey: "docegestao-admin", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Mensagem amigável a partir do erro do banco ("ADMIN: ..."). */
export function erroAmigavel(e: unknown) {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return m.replace(/^.*?ADMIN:\s*/, "");
}
