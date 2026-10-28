/** Esqueleto exibido enquanto uma tela carrega pela primeira vez. */
export function CarregandoTela() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Carregando">
      <div className="h-8 w-44 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-muted" />)}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
