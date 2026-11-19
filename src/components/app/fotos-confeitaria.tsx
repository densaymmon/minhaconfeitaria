import boloGotas from "@/assets/bolo-gotas-chocolate.webp";
import boloBranco from "@/assets/bolo-cobertura-branca.webp";
import paoTrancado from "@/assets/pao-trancado.webp";
import { cn } from "@/lib/utils";

const FOTOS = {
  boloGotas: { src: boloGotas, width: 960, height: 1200, alt: "Bolo com gotas de chocolate e cobertura de chocolate, com uma fatia cortada" },
  boloBranco: { src: boloBranco, width: 600, height: 600, alt: "Bolo de chocolate com cobertura branca, com uma fatia cortada" },
  paoTrancado: { src: paoTrancado, width: 600, height: 600, alt: "Pão trançado recheado sobre tábua de madeira" },
} as const;

/** Mosaico da página inicial: uma foto grande e duas menores ao lado. */
export function MosaicoFotos({ className }: { className?: string }) {
  return (
    <div className={cn("grid aspect-square grid-cols-3 grid-rows-2 gap-3", className)}>
      <img {...FOTOS.boloGotas} fetchPriority="high" decoding="async" className="col-span-2 row-span-2 size-full rounded-3xl object-cover shadow-soft" />
      <img {...FOTOS.boloBranco} decoding="async" className="size-full rounded-2xl object-cover shadow-soft" />
      <img {...FOTOS.paoTrancado} decoding="async" className="size-full rounded-2xl object-cover shadow-soft" />
    </div>
  );
}

/** Faixa da tela de login: as três fotos lado a lado. */
export function FaixaFotos({ className }: { className?: string }) {
  return (
    <div className={cn("grid aspect-[2/1] grid-cols-3 gap-2", className)}>
      {[FOTOS.boloGotas, FOTOS.boloBranco, FOTOS.paoTrancado].map((foto) => (
        <img key={foto.src} {...foto} decoding="async" className="size-full rounded-lg object-cover" />
      ))}
    </div>
  );
}
