import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { URL_PAINEL_ADMIN } from "@/lib/assinatura";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">Esta página não existe ou foi movida.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Não foi possível carregar a página."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#a83a46" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Doce Gestão" },
      { title: "Doce Gestão — Confeitaria" },
      { name: "description", content: "Gestão de pedidos, produção, receitas e finanças da confeitaria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icons/icone-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preload", href: "/fonts/figtree.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      // Abre a conexão com o banco enquanto a página carrega (catálogo e telas aparecem antes).
      ...(import.meta.env["VITE_SUPABASE_URL"] ? [{ rel: "preconnect", href: String(import.meta.env["VITE_SUPABASE_URL"]), crossOrigin: "anonymous" as const }] : []),
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Link pedido pelo painel de administração (?painel=admin): volta para o painel, que criou o pedido
            e é onde a nova senha é criada. Link de recuperação de senha (ou com erro) que caiu em outra página: vai para a página de nova senha
            antes de o app carregar, guardando os dados do link (o cliente do login limpa o endereço). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=window.location,d=l.hash+l.search;if(/[?&]painel=admin/.test(l.search)){l.replace(${JSON.stringify(URL_PAINEL_ADMIN)}+l.search+l.hash);return;}if(/type=recovery|error_code=|error_description=/.test(d)){sessionStorage.setItem("docegestao:link-senha",d);if(l.pathname!=="/reset-password")l.replace("/reset-password"+l.search+l.hash);}}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // O Supabase também avisa "SIGNED_IN" ao voltar para a aba; só recarrega tudo
    // quando a pessoa logada realmente muda (entrar, sair ou trocar de conta).
    let usuarioAtual: string | null | undefined;
    void supabase.auth.getSession().then(({ data }) => { usuarioAtual ??= data.session?.user.id ?? null; });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Link de recuperação que caiu em outra página (ex.: endereço principal): leva para criar a nova senha.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        window.location.assign("/reset-password");
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const novo = session?.user.id ?? null;
      if (event === "SIGNED_IN" && novo === usuarioAtual) return;
      usuarioAtual = novo;
      router.invalidate();
      if (event === "SIGNED_OUT") queryClient.clear();
      else queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
