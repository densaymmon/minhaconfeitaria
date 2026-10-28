import { supabase } from "@/integrations/supabase/client";
import type { MidiaCatalogo } from "@/lib/catalogo";

const LADO_MAXIMO = 1600;
const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024;
export const TAMANHO_MAXIMO_VIDEO = 50 * 1024 * 1024; // limite do bucket "catalogo"
export const MAXIMO_MIDIAS = 10;
const BUCKET = "catalogo";

/** Reduz a foto para no máximo 1600 px em JPEG, para carregar rápido no celular do cliente. */
export async function comprimirFoto(arquivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (blob && blob.size <= TAMANHO_MAXIMO_FOTO) return blob;
  } catch {
    /* formato que o navegador não abre (ex.: HEIC em alguns aparelhos): tenta o original */
  }
  if (arquivo.size > TAMANHO_MAXIMO_FOTO) throw new Error(`A foto "${arquivo.name}" é grande demais. Use uma imagem de até 2 MB.`);
  return arquivo;
}

export function tipoDaMidia(arquivo: File): MidiaCatalogo["tipo"] | null {
  if (arquivo.type.startsWith("image/")) return "imagem";
  if (arquivo.type.startsWith("video/")) return "video";
  return null;
}

/** Valida antes de enviar, para avisar logo ao escolher o arquivo. */
export function validarArquivoMidia(arquivo: File): string | null {
  const tipo = tipoDaMidia(arquivo);
  if (!tipo) return `"${arquivo.name}" não é foto nem vídeo.`;
  if (tipo === "video") {
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(arquivo.type)) return `O vídeo "${arquivo.name}" precisa ser MP4, WebM ou MOV.`;
    if (arquivo.size > TAMANHO_MAXIMO_VIDEO) return `O vídeo "${arquivo.name}" tem mais de 50 MB. Grave um vídeo mais curto (até uns 30 segundos).`;
  }
  return null;
}

/** Envia a foto (comprimida) ou o vídeo para a pasta da confeitaria e devolve o endereço público. */
export async function enviarMidiaProduto(userId: string, produtoId: string, arquivo: File): Promise<MidiaCatalogo> {
  const erro = validarArquivoMidia(arquivo);
  if (erro) throw new Error(erro);
  const tipo = tipoDaMidia(arquivo) ?? "imagem";
  const conteudo: Blob = tipo === "imagem" ? await comprimirFoto(arquivo) : arquivo;
  const contentType = conteudo.type || (tipo === "imagem" ? "image/jpeg" : "video/mp4");
  const extensoes: Record<string, string> = { "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
  const extensao = extensoes[contentType] ?? "jpg";
  const caminho = `${userId}/${produtoId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, conteudo, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Não foi possível enviar "${arquivo.name}": ${error.message}`);
  return { tipo, url: supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl };
}

/** Apaga do armazenamento arquivos removidos do produto (só os da própria pasta; falhas são ignoradas). */
export async function apagarArquivosMidia(userId: string, urls: string[]) {
  const marcador = `/storage/v1/object/public/${BUCKET}/`;
  const caminhos = urls
    .map((url) => (url.includes(marcador) ? decodeURIComponent(url.split(marcador)[1] ?? "") : ""))
    .filter((c) => c.startsWith(`${userId}/`));
  if (caminhos.length) await supabase.storage.from(BUCKET).remove(caminhos).catch(() => undefined);
}
