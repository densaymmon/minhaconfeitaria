import { fotosDeReferencia } from "@/lib/catalogo";

/** Miniaturas das fotos de referência que o cliente enviou na encomenda personalizada. */
export function FotosReferencia({ texto }: { texto: string | null | undefined }) {
  const fotos = fotosDeReferencia(texto);
  if (!fotos.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Fotos de referência do cliente</p>
      <div className="flex flex-wrap gap-2">
        {fotos.map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-xl bg-muted">
            <img src={url} alt={`Referência ${i + 1}`} loading="lazy" className="size-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
