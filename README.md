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

Pré-requisito: **Node.js 20+** instalado.

Crie um `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Preencha `GEMINI_API_KEY` para habilitar a geração automática de conversas.

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

- Next.js 16 (App Router) + React 18 + TypeScript
- TailwindCSS para estilo do painel de controle
- Canvas 2D para renderização do "celular" (frame-perfect)
- MediaRecorder API + `canvas.captureStream()` para encoding de vídeo
- Gemini API para gerar conversas aleatórias com contexto de imagem
- lucide-react para ícones da UI

## Estrutura

```
app/
  layout.tsx        # layout raiz
  page.tsx          # UI principal (form + preview + botão)
  globals.css       # estilos globais
  api/              # rotas para assets, Gemini e renderização no servidor
components/
  Form.tsx          # formulário de configuração
  Preview.tsx       # preview canvas + handle para gravar
  ResultModal.tsx   # pré-visualização e download do vídeo gerado
lib/
  defaultConfig.ts  # configuração inicial do editor
  generatedConversation.ts # montagem da conversa retornada pelo Gemini
  publicAssets.ts   # helpers compartilhados de URLs/assets públicos
  types.ts          # tipos compartilhados
  animation.ts      # timeline / fases / easing
  renderer.ts       # desenho do frame no canvas (todo o estilo IG)
  recorder.ts       # MediaRecorder + download
hooks/
  usePublicAssetFiles.ts # hook para listar assets públicos via API
```

## Lista de features para lançar no DirectViral

1. **Modo print de Direct**
   Criar conversas também em formato de imagem estática, prontas para posts, thumbnails e carrosséis. Hoje o foco principal é gerar vídeo.

2. **Resposta a stories de Melhores Amigos**
   Adicionar suporte visual para replies em stories de Melhores Amigos, incluindo a estrela verde e os detalhes do layout do Instagram.

3. **Wallpapers de conversa**
   Permitir escolher fundos de conversa iguais aos do Instagram, deixando o Direct mais fiel e personalizável.

4. **Chamada de ação personalizada**
   Dar liberdade para configurar a própria CTA dentro do vídeo, em vez de usar apenas o fluxo padrão do PuxeAssunto.

5. **Editor de mídia**
   Permitir adicionar músicas, efeitos sonoros e memes próprios, com controles de edição como corte, volume, duração e posicionamento.
