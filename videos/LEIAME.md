# Vídeos com HyperFrames

Projeto de vídeo separado do app da confeitaria (não mexe no `package.json` da raiz).
Guia oficial: https://github.com/heygen-com/hyperframes

## O que precisa estar instalado

- Node.js 22 ou mais novo (`node -v`)
- FFmpeg (`ffmpeg -version`)
- Chrome/Chromium (o HyperFrames usa para renderizar)
- O CLI roda via `npx hyperframes@0.9.35` (versão fixa no `package.json` desta pasta), sem instalação global.
- Diagnóstico completo: `npx hyperframes@0.9.35 doctor` (whisper, Kokoro, MusicGen e Docker são opcionais).

## Skills do Claude Code

As skills oficiais (`hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use`,
`reverse-any-video`, `style-sampling`) estão em `videos/.claude/skills/`.
Para atualizar ou reinstalar: `cd videos && npx hyperframes@0.9.35 skills update`.
Skills recém-instaladas só aparecem numa sessão nova do Claude Code.

## Arquivos

- `index.html`: composição principal (5 s, 1920×1080, 30 fps) com as variáveis editáveis
  (título, chamada e cores).
- `compositions/titulo.html`: a cena do título animado.
- `../exportados/meu-primeiro-video.mp4`: o vídeo renderizado.

## Projetos

- `videos/` (esta pasta): o teste "Meu primeiro vídeo".
- `videos/manipulacao/`: o vídeo piloto "Sinais de manipulação emocional", em 6 partes, com voz
  local (Kokoro) e trilha sintetizada. Veja `videos/manipulacao/LEIAME.md`.

## Comandos

```bash
cd videos
npm run check                              # valida a composição
npx hyperframes@0.9.35 snapshot --at 0,1,2.5,4.6   # quadros em PNG
npm run dev                                # pré-visualização no navegador
npx hyperframes@0.9.35 render -q delivery -o ../exportados/meu-primeiro-video.mp4
```
