import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "./App";
import "./admin.css";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ligarMonitorDeErros } from "@/lib/monitor-erros";
import { supabase } from "./supabase";

// Erros de tela do painel também vão para a lista de erros.
ligarMonitorDeErros(supabase as unknown as SupabaseClient, () => "admin");

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

const raiz = document.getElementById("root");
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </StrictMode>,
  );
}
