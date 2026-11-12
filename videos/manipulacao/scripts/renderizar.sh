#!/usr/bin/env bash
# Verifica e/ou renderiza as partes do vídeo.
# O HyperFrames usa um único arquivo raiz (index.html), então este script copia
# partes/parte-N.html para index.html antes de cada etapa.
#
# Uso (na pasta videos/manipulacao):
#   scripts/renderizar.sh check            # verifica todas as partes
#   scripts/renderizar.sh render           # renderiza todas para ../../exportados/manipulacao/
#   scripts/renderizar.sh render 2 4       # só as partes 2 e 4
#   scripts/renderizar.sh completo         # junta as partes já renderizadas num MP4 único
set -euo pipefail
cd "$(dirname "$0")/.."
HF="npx -y hyperframes@0.9.35"
SAIDA="../../exportados/manipulacao"
acao="${1:-check}"; shift || true
partes=("$@"); [ ${#partes[@]} -eq 0 ] && partes=(1 2 3 4 5 6)
mkdir -p "$SAIDA"

if [ "$acao" = "completo" ]; then
  lista=$(mktemp)
  for n in 1 2 3 4 5 6; do echo "file '$(realpath "$SAIDA/parte-$n.mp4")'" >> "$lista"; done
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$lista" -c copy "$SAIDA/video-completo.mp4"
  rm -f "$lista"; echo "$SAIDA/video-completo.mp4"; exit 0
fi

for n in "${partes[@]}"; do
  cp "partes/parte-$n.html" index.html
  echo "== parte $n: $acao"
  case "$acao" in
    check) $HF check ;;
    render) $HF render -q delivery -o "$SAIDA/parte-$n.mp4" --quiet ;;
    *) echo "ação desconhecida: $acao"; exit 1 ;;
  esac
done
cp partes/parte-1.html index.html
