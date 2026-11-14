import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase as generatedClient } from "@/integrations/supabase/client";

// Optional schema 0050 may not be deployed. Keep its existing runtime fallback;
// generated types intentionally describe only the live database.
export type DespesaRecorrente = {
  id: string; user_id: string; descricao: string; categoria: string; valor: number;
  inicio: string; fim: string | null; gerado_ate: string | null;
  created_at: string; updated_at: string;
};
type Functions = Database["public"]["Functions"];
export type CompatibleDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      despesas_recorrentes: {
        Row: DespesaRecorrente;
        Insert: Pick<DespesaRecorrente, "descricao" | "categoria" | "valor" | "inicio"> & { fim?: string | null };
        Update: Partial<Pick<DespesaRecorrente, "descricao" | "categoria" | "valor" | "fim">>;
        Relationships: [];
      };
    };
    Functions: Omit<Functions, "alterar_membro" | "admin_listar_pagamentos" | "admin_registrar_pagamento"> & {
      gerar_despesas_recorrentes: { Args: { p_hoje: string }; Returns: number };
      alterar_membro: Omit<Functions["alterar_membro"], "Args"> & { Args: { p_id: string; p_papel: string | null } };
      admin_listar_pagamentos: Omit<Functions["admin_listar_pagamentos"], "Args"> & { Args: { p_user_id: string | null } };
      admin_registrar_pagamento: Omit<Functions["admin_registrar_pagamento"], "Args"> & {
        Args: Omit<Functions["admin_registrar_pagamento"]["Args"], "p_forma" | "p_observacao"> & { p_forma: string | null; p_observacao: string | null };
      };
    };
  };
};

// Same client, auth and RLS; type compatibility only, no new connection or writes.
export const supabase = generatedClient as unknown as SupabaseClient<CompatibleDatabase>;