"""Gera a narração de cada bloco com o Kokoro (local) e mede o tempo de cada frase.

Saídas:
  assets/voz/<bloco>.m4a  narração do bloco, já com o silêncio de início e de fim
  tempos.json             duração de cada bloco e início/fim de cada frase (segundos)

Uso (na pasta videos/manipulacao):
  python3 -I scripts/gerar_voz.py            # todos os blocos
  python3 -I scripts/gerar_voz.py sinal1     # só os blocos indicados
Antes, rode uma vez `npx hyperframes@0.9.35 tts --list` para baixar o modelo.
"""

import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

AQUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.expanduser("~/.cache/hyperframes/tts")
TAXA = 24000
LUFS_VOZ = -16.0


def texto_falado(linha):
    texto = linha.get("f", linha["t"])
    # Aspas simples marcam falas; a voz não precisa delas.
    return re.sub(r"[‘’']", "", texto)


def normalizar(caminho):
    """Leva a narração a -16 LUFS com ganho linear (sem compressão)."""
    medida = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", caminho, "-af",
         f"loudnorm=I={LUFS_VOZ}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=True,
    ).stderr
    dados = json.loads(medida[medida.rindex("{"): medida.rindex("}") + 1])
    ganho = LUFS_VOZ - float(dados["input_i"])
    pico = float(dados["input_tp"]) + ganho
    if pico > -1.0:
        ganho -= pico + 1.0
    temp = caminho + ".tmp.wav"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", caminho,
         "-af", f"volume={ganho:.2f}dB", "-ar", "48000", temp],
        check=True,
    )
    os.replace(temp, caminho)


def main():
    roteiro = json.load(open(os.path.join(AQUI, "roteiro.json"), encoding="utf-8"))
    voz = roteiro["voz"]
    pausas = roteiro["pausas"]
    so = set(sys.argv[1:])

    caminho_tempos = os.path.join(AQUI, "tempos.json")
    tempos = json.load(open(caminho_tempos)) if os.path.exists(caminho_tempos) else {}

    kokoro = Kokoro(os.path.join(CACHE, "models/kokoro-v1.0.onnx"),
                    os.path.join(CACHE, "voices/voices-v1.0.bin"))
    os.makedirs(os.path.join(AQUI, "assets/voz"), exist_ok=True)

    for bloco_id, bloco in roteiro["blocos"].items():
        if so and bloco_id not in so:
            continue
        if not bloco["linhas"]:
            tempos[bloco_id] = {"duracao": bloco.get("duracao", 3.0), "linhas": {}, "voz": None}
            continue
        partes = [np.zeros(int(pausas["inicio"] * TAXA), dtype=np.float32)]
        cursor = pausas["inicio"]
        linhas = {}
        for i, linha in enumerate(bloco["linhas"]):
            audio, taxa = kokoro.create(texto_falado(linha), voice=voz["id"],
                                        speed=voz["velocidade"], lang=voz["lang"])
            assert taxa == TAXA, taxa
            dur = len(audio) / TAXA
            linhas[linha.get("id", f"l{i}")] = {"ini": round(cursor, 3), "fim": round(cursor + dur, 3)}
            ultima = i == len(bloco["linhas"]) - 1
            pausa = pausas["fim"] if ultima else linha.get("p", pausas["normal"])
            partes += [audio.astype(np.float32), np.zeros(int(pausa * TAXA), dtype=np.float32)]
            cursor += dur + pausa
            print(f"  {bloco_id}[{i}] {dur:5.2f}s", flush=True)
        wav = os.path.join(AQUI, f"assets/voz/{bloco_id}.tmp.wav")
        sf.write(wav, np.concatenate(partes), TAXA)
        normalizar(wav)
        duracao = round(sf.info(wav).duration, 3)
        saida = f"assets/voz/{bloco_id}.m4a"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav,
                        "-c:a", "aac", "-b:a", "160k", os.path.join(AQUI, saida)], check=True)
        os.remove(wav)
        tempos[bloco_id] = {"duracao": duracao, "linhas": linhas, "voz": saida}
        print(f"{bloco_id}: {duracao:.1f}s", flush=True)
        json.dump(tempos, open(caminho_tempos, "w"), indent=2, ensure_ascii=False)

    json.dump(tempos, open(caminho_tempos, "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
