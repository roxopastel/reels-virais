# Gerador de Conversas Instagram

Gere vídeos curtos que simulam uma conversa de **Instagram Direct** (modo escuro), prontos para Reels, Stories ou TikTok.

## Funcionalidades (v1 – básico)

- Renderização fiel do estilo IG DM (status bar, header, balões, indicador de digitando, barra de input).
- Animação: você envia → vê a pessoa digitando → ela responde.
- 1 mensagem enviada + 1 mensagem recebida.
- Customização: nome de usuário, foto de perfil, status, mensagens, duração do "digitando", horário.
- Download direto como vídeo `.webm` (ou `.mp4` no Safari).
- Saída em **1080×1920 (9:16)** — pronto para Reels.

## Como rodar

Pré-requisito: **Node.js 18+** instalado.

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Como gerar um vídeo

1. Preencha o formulário à esquerda (nome, foto, mensagens, etc.).
2. Veja o preview animado à direita (loop automático).
3. Clique em **Gerar e baixar vídeo**.
4. Aguarde a gravação (~5–8 segundos, dependendo da duração).
5. O arquivo será baixado automaticamente.

> **Recomendado**: use **Chrome** ou **Edge** para máxima compatibilidade com `MediaRecorder` (saída `.webm`).
> No Safari, a saída sai como `.mp4`.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- TailwindCSS para estilo do painel de controle
- Canvas 2D para renderização do "celular" (frame-perfect)
- MediaRecorder API + `canvas.captureStream()` para encoding de vídeo
- lucide-react para ícones da UI

## Estrutura

```
app/
  layout.tsx        # layout raiz
  page.tsx          # UI principal (form + preview + botão)
  globals.css       # estilos globais
components/
  Form.tsx          # formulário de configuração
  Preview.tsx       # preview canvas + handle para gravar
lib/
  types.ts          # tipos compartilhados
  animation.ts      # timeline / fases / easing
  renderer.ts       # desenho do frame no canvas (todo o estilo IG)
  recorder.ts       # MediaRecorder + download
```

## Próximos passos (ideias)

- Múltiplas mensagens em sequência (timeline editável).
- Modo claro do Instagram.
- Story replies, áudios, anexos de imagem.
- Tema/cores customizáveis.
- Export em MP4 nativo via `ffmpeg.wasm`.
