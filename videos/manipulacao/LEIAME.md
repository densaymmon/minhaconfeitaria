# Sinais de manipulação emocional (vídeo piloto)

Vídeo animado feito com HyperFrames a partir do roteiro do canal dark de psicologia
(`roteiro.json`, tirado do documento "roteiro-piloto-manipulacao.docx").
São 13 blocos em 6 partes, com ~9:28 no total:

| Parte | Blocos | Duração |
|---|---|---|
| 1 | Gancho + assinatura do canal + Introdução | 1:06 |
| 2 | Sinal 1 (Love bombing) + Sinal 2 (Gaslighting) | 1:58 |
| 3 | Sinal 3 (Culpa) + Gancho de retenção | 1:16 |
| 4 | Sinal 4 (Reforço intermitente) + Sinal 5 (Triangulação) | 1:59 |
| 5 | Sinal 6 (Metas que se movem) + Sinal 7 (Silêncio) | 1:49 |
| 6 | Conexão + Nota de cuidado (CVV) + Chamada para ação | 1:21 |

Vídeos prontos: `exportados/manipulacao/parte-1.mp4` … `parte-6.mp4` e `video-completo.mp4`.

## Como foi montado

- **Voz:** Kokoro (local e gratuito), voz `pm_alex` em pt-BR, a 0,9× da velocidade. Nomes e termos em
  inglês têm uma grafia fonética só para a voz (campo `f` no roteiro, por exemplo "lâv bâmin").
- **Trilha:** drone grave sintetizado com FFmpeg (`assets/trilha/drone.m4a`, cerca de −38 LUFS contra
  −16 LUFS da voz), mais baixo na nota do CVV. Assinatura do canal: sub-bass com clique (`assets/sfx/`).
- **Visual:** a paleta, as fontes (Bebas Neue, Inter e Cormorant Garamond) e os motivos do roteiro,
  desenhados em SVG: fios de marionete, celular, espelho embaçado, lâmpada a gás, porta entreaberta,
  labirinto, caça-níquel, triângulo, linha de chegada, relógio e janela ao amanhecer.
  Cada estudo citado ganha um cartão de fonte por 4 s.
- **Nome do canal:** "Sem Perceber" (a 1ª sugestão do documento) é só o valor padrão. Para trocar,
  mude `CANAL_PADRAO` em `scripts/montar.mjs` e gere de novo, ou edite a variável "Nome do canal"
  na pré-visualização.

## Arquivos

- `roteiro.json`: o texto de cada frase, a pronúncia, os textos na tela e os cartões de fonte.
- `tempos.json`: gerado; início e fim de cada frase na narração (é o que sincroniza a animação).
- `scripts/gerar_voz.py`: gera a narração (`assets/voz/*.m4a`) e o `tempos.json`.
- `scripts/montar.mjs`: gera as cenas (`compositions/*.html`) e as partes (`partes/parte-N.html`).
- `scripts/renderizar.sh`: verifica e renderiza as partes e junta o vídeo completo.
- `index.html`: a parte aberta na pré-visualização (o HyperFrames usa um arquivo raiz só).

## Refazer ou alterar

```bash
cd videos/manipulacao
pip install kokoro-onnx soundfile          # uma vez (voz local)
npx hyperframes@0.9.35 tts --list          # uma vez: baixa o modelo Kokoro
python3 -I scripts/gerar_voz.py            # toda a narração (ou: ... gerar_voz.py sinal3)
node scripts/montar.mjs                    # cenas e partes
scripts/renderizar.sh check                # verificação das 6 partes
scripts/renderizar.sh render               # renderiza tudo (ou: render 2 4)
scripts/renderizar.sh completo             # junta as partes num MP4 só
```

Para ver e editar uma parte no navegador: `cp partes/parte-3.html index.html && npx hyperframes@0.9.35 preview`.
Edições feitas direto em `compositions/` são apagadas na próxima vez que `montar.mjs` rodar.
