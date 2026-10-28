import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CakeSlice } from "lucide-react";
import { plataformaPublicaQ } from "@/lib/queries";
import { NOME_PLATAFORMA, dataVersao, type PlataformaPublica, type Secao } from "@/lib/termos";

/** Página pública de texto legal (termos de uso, política de privacidade). */
export function PaginaLegal({ titulo, secoes }: { titulo: string; secoes: (p: PlataformaPublica | null) => Secao[] }) {
  const { data: plataforma = null } = useQuery(plataformaPublicaQ);
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link to="/auth" className="mb-8 inline-flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><CakeSlice className="size-5" /></span>
          {NOME_PLATAFORMA}
        </Link>
        <h1 className="font-display text-3xl font-semibold">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Versão de {dataVersao()}</p>
        <div className="mt-8 space-y-7">
          {secoes(plataforma).map((s) => (
            <section key={s.titulo}>
              <h2 className="mb-2 text-lg font-semibold">{s.titulo}</h2>
              <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                {s.paragrafos.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
        <nav className="mt-10 flex flex-wrap gap-4 border-t pt-6 text-sm" aria-label="Documentos">
          <Link to="/termos" className="text-primary hover:underline">Termos de uso</Link>
          <Link to="/privacidade" className="text-primary hover:underline">Política de privacidade</Link>
          <Link to="/auth" className="text-muted-foreground hover:underline">Entrar no sistema</Link>
        </nav>
      </main>
    </div>
  );
}
