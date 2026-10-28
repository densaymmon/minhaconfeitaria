import { ChevronLeft, ChevronRight, ImagePlus, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAXIMO_MIDIAS, tipoDaMidia, validarArquivoMidia } from "@/lib/foto-catalogo";
import { cn } from "@/lib/utils";

/** Foto ou vídeo na tela de produto: já salvo (url) ou escolhido e ainda não enviado (arquivo). */
export type MidiaEditavel = {
  chave: string;
  tipo: "imagem" | "video";
  url?: string;
  arquivo?: File;
  previa: string;
};

export function midiaSalva(tipo: "imagem" | "video", url: string): MidiaEditavel {
  return { chave: url, tipo, url, previa: url };
}

/**
 * Galeria editável: adicionar várias fotos e vídeos, mudar a ordem e remover.
 * A primeira foto é a capa do produto no catálogo. Nada é enviado até salvar o produto.
 */
export function GaleriaMidias({ midias, onChange, desabilitado }: { midias: MidiaEditavel[]; onChange: (m: MidiaEditavel[]) => void; desabilitado?: boolean }) {
  const capa = midias.find((m) => m.tipo === "imagem")?.chave;

  function adicionar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const novas: MidiaEditavel[] = [];
    for (const arquivo of Array.from(arquivos)) {
      if (midias.length + novas.length >= MAXIMO_MIDIAS) {
        toast.error(`Cada produto pode ter até ${MAXIMO_MIDIAS} fotos e vídeos.`);
        break;
      }
      const erro = validarArquivoMidia(arquivo);
      const tipo = tipoDaMidia(arquivo);
      if (erro || !tipo) {
        toast.error(erro ?? "Arquivo não suportado.");
        continue;
      }
      novas.push({ chave: `${arquivo.name}-${arquivo.size}-${Date.now()}-${novas.length}`, tipo, arquivo, previa: URL.createObjectURL(arquivo) });
    }
    if (novas.length) onChange([...midias, ...novas]);
  }

  function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= midias.length) return;
    const lista = [...midias];
    const [item] = lista.splice(indice, 1);
    if (!item) return;
    lista.splice(destino, 0, item);
    onChange(lista);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {midias.map((m, i) => (
          <div key={m.chave} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
            {m.tipo === "imagem"
              ? <img src={m.previa} alt={`Foto ${i + 1}`} className="size-full object-cover" />
              : <video src={m.previa} muted playsInline preload="metadata" className="size-full object-cover" />}
            {m.tipo === "video" && <PlayCircle className="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />}
            {m.chave === capa && <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Capa</span>}
            {m.arquivo && <span className="absolute bottom-1 left-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium">Novo</span>}
            <button type="button" disabled={desabilitado} onClick={() => onChange(midias.filter((x) => x.chave !== m.chave))} aria-label={`Remover ${m.tipo === "video" ? "vídeo" : "foto"} ${i + 1}`}
              className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow">
              <X className="size-4" />
            </button>
            <div className="absolute bottom-1 right-1 flex gap-1">
              <button type="button" disabled={desabilitado || i === 0} onClick={() => mover(i, -1)} aria-label="Mover para antes" className={cn("grid size-7 place-items-center rounded-full bg-background/90 shadow", i === 0 && "opacity-40")}><ChevronLeft className="size-4" /></button>
              <button type="button" disabled={desabilitado || i === midias.length - 1} onClick={() => mover(i, 1)} aria-label="Mover para depois" className={cn("grid size-7 place-items-center rounded-full bg-background/90 shadow", i === midias.length - 1 && "opacity-40")}><ChevronRight className="size-4" /></button>
            </div>
          </div>
        ))}
        {midias.length < MAXIMO_MIDIAS && (
          <label className={cn("grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed text-center text-xs text-muted-foreground hover:bg-muted", desabilitado && "pointer-events-none opacity-50")}>
            <span className="flex flex-col items-center gap-1 px-2"><ImagePlus className="size-6" /> Adicionar fotos e vídeos</span>
            <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple className="sr-only" disabled={desabilitado}
              onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Até {MAXIMO_MIDIAS} fotos e vídeos. A primeira foto é a capa. Vídeos curtos (até 50 MB, uns 30 segundos) carregam melhor no celular do cliente.
      </p>
      {midias.length > 0 && !desabilitado && (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onChange([])}>Remover todas</Button>
      )}
    </div>
  );
}
