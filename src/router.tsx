import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { CarregandoTela } from "./components/app/carregando";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dados vistos há pouco são reaproveitados ao trocar de tela (sem esperar o servidor);
        // a atualização acontece em segundo plano.
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Começa a carregar a próxima tela quando o dedo/cursor encosta no link.
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 0,
    // Se a tela demorar, mostra o esqueleto rapidamente em vez de "travar" na anterior.
    defaultPendingMs: 150,
    defaultPendingMinMs: 250,
    defaultPendingComponent: CarregandoTela,
  });

  return router;
};
