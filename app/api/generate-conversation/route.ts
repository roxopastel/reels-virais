import { NextResponse } from "next/server";
import type { GeneratedConversation } from "@/lib/generatedConversation";
import {
  PHOTO_EXTENSIONS,
  photoFileNameFromUrl,
  photoUrl,
  pickRandomFile,
  publicPhotoUrl,
} from "@/lib/publicAssets";
import {
  listPublicAssetFiles,
  loadInlineImagePart,
} from "@/lib/serverPublicAssets";
import type { VideoPublishMetadata } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateConversationRequest {
  avatarImageUrl?: string;
  storyImageUrl?: string;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FIRST_SENT_MAX_LENGTH = 180;
const RECEIVED_MAX_LENGTH = 120;
const SENT_REPLY_MAX_LENGTH = 180;
const PROFILE_DISPLAY_NAME_MAX_LENGTH = 40;
const VIDEO_TITLE_MAX_LENGTH = 80;
const VIDEO_DESCRIPTION_MAX_LENGTH = 260;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    username: { type: "STRING" },
    profileDisplayName: { type: "STRING" },
    firstSent: { type: "STRING" },
    receivedBatch: {
      type: "ARRAY",
      minItems: 2,
      maxItems: 3,
      items: { type: "STRING" },
    },
    responseAlternatives: {
      type: "ARRAY",
      minItems: 4,
      maxItems: 4,
      items: { type: "STRING" },
    },
    sentReply: { type: "STRING" },
    finalReceived: { type: "STRING" },
    videoMetadata: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        hashtags: {
          type: "ARRAY",
          minItems: 4,
          maxItems: 8,
          items: { type: "STRING" },
        },
        keywords: {
          type: "ARRAY",
          minItems: 5,
          maxItems: 10,
          items: { type: "STRING" },
        },
      },
      required: ["title", "description", "hashtags", "keywords"],
      propertyOrdering: ["title", "description", "hashtags", "keywords"],
    },
  },
  required: [
    "username",
    "profileDisplayName",
    "firstSent",
    "receivedBatch",
    "responseAlternatives",
    "sentReply",
    "finalReceived",
    "videoMetadata",
  ],
  propertyOrdering: [
    "username",
    "profileDisplayName",
    "firstSent",
    "receivedBatch",
    "responseAlternatives",
    "sentReply",
    "finalReceived",
    "videoMetadata",
  ],
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY nao esta configurada." },
      { status: 500 }
    );
  }

  const body = (await safeJson(request)) as GenerateConversationRequest;
  const storyImage = await loadInlineImagePart(body?.storyImageUrl);
  const seed = Math.floor(Math.random() * 1_000_000);
  const prompt = [
    "Gere uma conversa aleatoria de Instagram DM em portugues do Brasil.",
    "Contexto fixo de personagens: um homem esta respondendo ao story de uma mulher.",
    "A conversa e entre um homem (mensagens da pessoa usuaria/sent) e uma mulher (mensagens da outra pessoa/received).",
    "O homem da em cima da mulher. A mulher responde ao homem.",
    "Mantenha genero gramatical coerente: falas do homem no masculino quando falar de si; falas da mulher no feminino quando falar de si.",
    "Quando a mulher estiver falando sobre o homem ou chamando ele, use masculino: bobo, lindo, fofo, convencido, engraçado, danado, esperto.",
    "Exemplo correto de resposta dela: 'hahaha bobo', nunca 'hahaha boba'.",
    storyImage
      ? "A imagem anexada e o story da mulher que o homem respondeu. Use elementos visuais dela como contexto para a cantada, sem descrever a foto de forma robotica."
      : "A primeira mensagem deve soar como resposta a um story, mesmo sem imagem anexada.",
    "Formato narrativo obrigatorio:",
    "1. O homem envia exatamente 1 mensagem inicial curta respondendo ao story dela.",
    "2. A mulher responde em massa com 2 a 3 mensagens curtas separadas.",
    "3. Depois desse lote recebido, o app puxeassunto sugere a proxima resposta do homem.",
    "4. O homem envia exatamente essa resposta sugerida.",
    "5. A mulher envia exatamente 1 resposta final curta e positiva.",
    "A resposta final precisa mostrar que a resposta do homem deu certo: ela gostou, aceitou, riu, puxou mais assunto ou ficou interessada.",
    "",
    "Estilo: cantada leve, dar em cima com charme, natural, engracado, cotidiano, sem parecer roteiro.",
    "A primeira mensagem do homem precisa ser uma abertura/cantada relacionada ao story dela.",
    "A resposta sugerida do homem precisa ser uma boa cantada ou convite leve, como algo que realmente faria a conversa andar.",
    "Nao escreva a mulher falando como homem nem o homem falando como mulher.",
    "Nas mensagens received, a mulher pode estar no feminino sobre si mesma, mas qualquer apelido/adjetivo direcionado ao homem precisa ficar no masculino.",
    "Gere tambem 4 alternativas de resposta para o site mostrar.",
    "As 4 alternativas precisam ser diferentes entre si: direta, engracada, escolhida e provocativa.",
    "A terceira alternativa do array responseAlternatives e obrigatoriamente a escolhida/copied e deve ser exatamente igual ao campo sentReply.",
    "Nao repita a mesma frase nas alternativas.",
    "Gere tambem videoMetadata para publicacao do video curto.",
    "videoMetadata.title deve parecer titulo de Shorts/Reels: natural, curioso, 45 a 80 caracteres, sem emoji e sem hashtag.",
    "videoMetadata.description deve parecer legenda pronta para upload: 120 a 260 caracteres, com gancho, contexto da conversa e chamada leve para comentario.",
    "videoMetadata.hashtags deve ter 4 a 8 hashtags curtas sem o caractere #.",
    "videoMetadata.keywords deve ter 5 a 10 termos de busca relacionados ao tema do video.",
    "Nao use conteudo sexual explicito, menores de idade, drogas pesadas, crime ou assedio.",
    "Mensagens devem ser curtas, como DM real, com girias brasileiras leves.",
    "Nao mencione IA, Gemini, puxeassunto ou geracao automatica dentro das mensagens.",
    `Seed criativa: ${seed}.`,
    "",
    "Responda somente com JSON valido no schema solicitado.",
  ].join("\n");

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [...(storyImage ? [storyImage] : []), { text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 1.05,
          topP: 0.92,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        data?.error?.message || "Falha ao chamar a API do Gemini.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const text = extractGeminiText(data);
    const generated = await withRandomPhotos(
      normalizeGeneratedConversation(parseJsonText(text)),
      body?.avatarImageUrl,
      body?.storyImageUrl
    );
    return NextResponse.json({ conversation: generated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado ao gerar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function extractGeminiText(data: unknown): string {
  const parts =
    (data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    })?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

function parseJsonText(text: string): unknown {
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }
    throw new Error("O Gemini nao retornou JSON valido.");
  }
}

function normalizeGeneratedConversation(raw: unknown): GeneratedConversation {
  const source = (raw ?? {}) as Partial<GeneratedConversation>;
  const receivedBatch = normalizeReceivedMessages(
    normalizeTextArray(source.receivedBatch, 2, 3, [
      "pera kkkkk",
      "isso foi muito especifico",
      "mas confesso que gostei",
    ])
  );

  const finalReceived = normalizeReceivedMessage(
    sanitizeText(source.finalReceived, RECEIVED_MAX_LENGTH)
  );
  const sentReply =
    sanitizeText(source.sentReply, SENT_REPLY_MAX_LENGTH) ||
    "entao pronto, agora fiquei curioso de verdade";
  const responseAlternatives = normalizeResponseAlternatives(
    source.responseAlternatives,
    sentReply
  );
  const normalized: GeneratedConversation = {
    username: slugifyUsername(source.username) || "luluzinha",
    profileDisplayName:
      sanitizeText(source.profileDisplayName, PROFILE_DISPLAY_NAME_MAX_LENGTH) ||
      "Luiza Marqueza",
    firstSent:
      sanitizeText(source.firstSent, FIRST_SENT_MAX_LENGTH) ||
      "me responde uma coisa rapidinho",
    receivedBatch,
    responseAlternatives,
    sentReply,
    finalReceived: finalReceived || "kkkk pior que essa foi boa, gostei",
  };
  normalized.videoMetadata = normalizeVideoMetadata(
    source.videoMetadata,
    normalized
  );
  return normalized;
}

function normalizeVideoMetadata(
  value: unknown,
  conversation: GeneratedConversation
): VideoPublishMetadata {
  const source = (value ?? {}) as Partial<VideoPublishMetadata>;
  const hashtags = normalizeHashtags(source.hashtags);
  const keywords = normalizeKeywords(source.keywords, conversation, hashtags);
  const title =
    sanitizeVideoTitle(source.title) || buildFallbackVideoTitle(conversation);
  const description =
    sanitizeText(source.description, VIDEO_DESCRIPTION_MAX_LENGTH) ||
    buildFallbackVideoDescription(conversation);

  return {
    title,
    description,
    hashtags,
    keywords,
  };
}

function sanitizeVideoTitle(value: unknown): string {
  return sanitizeText(value, VIDEO_TITLE_MAX_LENGTH)
    .replace(/[<>:"/\\|?*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHashtags(value: unknown): string[] {
  const defaults = [
    "conversa",
    "direct",
    "instagram",
    "cantada",
    "flertando",
    "viral",
  ];
  const source = Array.isArray(value) ? value : [];
  return uniqueStrings(
    [...source, ...defaults].map((item) => sanitizeHashtag(item)).filter(Boolean)
  ).slice(0, 8);
}

function sanitizeHashtag(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

function normalizeKeywords(
  value: unknown,
  conversation: GeneratedConversation,
  hashtags: string[]
): string[] {
  const defaults = [
    "conversa no direct",
    "instagram dm",
    "cantada leve",
    "puxe assunto",
    conversation.profileDisplayName,
    conversation.username,
    ...hashtags,
  ];
  const source = Array.isArray(value) ? value : [];
  return uniqueStrings(
    [...source, ...defaults]
      .map((item) => sanitizeKeyword(item))
      .filter(Boolean)
  ).slice(0, 10);
}

function sanitizeKeyword(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function buildFallbackVideoTitle(conversation: GeneratedConversation): string {
  if (conversation.sentReply) {
    return `A resposta ao story que fez ela continuar a conversa`;
  }
  return "A conversa no direct que virou assunto";
}

function buildFallbackVideoDescription(
  conversation: GeneratedConversation
): string {
  const hook = conversation.firstSent || "Ele respondeu o story dela";
  return sanitizeText(
    `${hook} e a conversa tomou outro rumo. Um print em formato de video curto, com final leve e aquela resposta que da vontade de comentar.`,
    VIDEO_DESCRIPTION_MAX_LENGTH
  );
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function normalizeResponseAlternatives(
  value: unknown,
  sentReply: string
): string[] {
  const source = Array.isArray(value)
    ? value
        .map((item) => sanitizeText(item, SENT_REPLY_MAX_LENGTH))
        .filter(Boolean)
    : [];
  const alternatives = [
    source[0] || makeDirectAlternative(sentReply),
    source[1] || makeFunnyAlternative(sentReply),
    sentReply,
    source[3] || makeProvocativeAlternative(sentReply),
  ];
  return alternatives.map((text, index) =>
    dedupeAlternative(text, alternatives, index, sentReply)
  );
}

function dedupeAlternative(
  text: string,
  alternatives: string[],
  index: number,
  sentReply: string
): string {
  if (index === 2) return sentReply;
  const duplicatedEarlier = alternatives
    .slice(0, index)
    .some((other) => other.trim().toLowerCase() === text.trim().toLowerCase());
  if (!duplicatedEarlier && text.trim().toLowerCase() !== sentReply.trim().toLowerCase()) {
    return text;
  }
  if (index === 0) return makeDirectAlternative(sentReply);
  if (index === 1) return makeFunnyAlternative(sentReply);
  return makeProvocativeAlternative(sentReply);
}

function makeDirectAlternative(text: string): string {
  return `Bora testar essa ideia: ${text}`;
}

function makeFunnyAlternative(text: string): string {
  return `${text} kkk prometo que pensei nessa com carinho`;
}

function makeProvocativeAlternative(text: string): string {
  return `${text} mas so se voce prometer que vai fazer valer`;
}

function normalizeReceivedMessages(messages: string[]): string[] {
  return messages.map(normalizeReceivedMessage);
}

function normalizeReceivedMessage(text: string): string {
  let normalized = text;
  const directedFemaleToMalePairs: Array<[RegExp, string]> = [
    [/\bboba\b/gi, "bobo"],
    [/\blinda\b/gi, "lindo"],
    [/\bfofa\b/gi, "fofo"],
    [/\bengraçada\b/gi, "engraçado"],
    [/\bconvencida\b/gi, "convencido"],
    [/\bdanada\b/gi, "danado"],
    [/\besperta\b/gi, "esperto"],
    [/\bespertinha\b/gi, "espertinho"],
    [/\bousada\b/gi, "ousado"],
    [/\bmetida\b/gi, "metido"],
    [/\bsafada\b/gi, "safado"],
  ];

  for (const [pattern, replacement] of directedFemaleToMalePairs) {
    normalized = normalized.replace(pattern, (match, offset, fullText) => {
      if (isLikelyWomanSelfReference(fullText, offset)) {
        return match;
      }
      return match === match.toUpperCase()
        ? replacement.toUpperCase()
        : replacement;
    });
  }

  return normalized;
}

function isLikelyWomanSelfReference(text: string, adjectiveOffset: number): boolean {
  const before = text.slice(0, adjectiveOffset).toLowerCase();
  return /\b(eu|me|to|tô|estou|sou|fiquei|fico|fui|meu jeito de ser)\s+$/i.test(
    before
  );
}

async function withRandomPhotos(
  conversation: GeneratedConversation,
  selectedAvatarUrl: string | undefined,
  selectedStoryUrl: string | undefined
): Promise<GeneratedConversation> {
  const files = await listPublicAssetFiles("fotos", PHOTO_EXTENSIONS).catch(
    () => []
  );
  const selectedAvatar = publicPhotoUrl(selectedAvatarUrl);
  const selectedStory = publicPhotoUrl(selectedStoryUrl);
  if (files.length === 0) {
    return {
      ...conversation,
      avatarImageUrl: selectedAvatar,
      storyImageUrl: selectedStory,
    };
  }

  const avatar = selectedAvatar ?? photoUrl(pickRandomFile(files));
  const story =
    selectedStory ??
    photoUrl(pickRandomFile(files, photoFileNameFromUrl(avatar) ?? undefined));
  return {
    ...conversation,
    avatarImageUrl: avatar,
    storyImageUrl: story,
  };
}

function normalizeTextArray(
  value: unknown,
  min: number,
  max: number,
  fallback: string[]
): string[] {
  const items = Array.isArray(value)
    ? value
        .map((item) => sanitizeText(item, RECEIVED_MAX_LENGTH))
        .filter(Boolean)
    : [];
  const limited = items.slice(0, max);
  while (limited.length < min) {
    limited.push(fallback[limited.length % fallback.length]);
  }
  return limited;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/\s+/g, " ").trim())
    .slice(0, maxLength)
    .join("");
}

function slugifyUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 24);
}
