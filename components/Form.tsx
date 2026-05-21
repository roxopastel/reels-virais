"use client";

import { useEffect, useRef, useState, ChangeEvent } from "react";
import {
  Camera,
  Upload,
  User,
  MessageSquare,
  Plus,
  Trash2,
  ArrowLeftRight,
  Image as ImageIcon,
  X as XIcon,
  Wand2,
  Volume2,
  Play,
  ZoomIn,
  Search,
  Settings2,
  Pause,
  ChevronDown,
} from "lucide-react";
import {
  DEFAULT_SFX,
  SLOT_DEFAULT_LABEL,
  fileToUrl,
  musicFileToUrl,
  type SfxSlot,
} from "@/lib/audio";
import type {
  ConversationConfig,
  Message,
  MessageAudio,
  MessageSide,
  SfxChoice,
  TypingSoundMode,
} from "@/lib/types";

interface FormProps {
  config: ConversationConfig;
  onChange: (next: ConversationConfig) => void;
  disabled?: boolean;
}

export function Form({ config, onChange, disabled }: FormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Record<string, boolean>
  >({});
  const update = <K extends keyof ConversationConfig>(
    key: K,
    value: ConversationConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };
  const { files: musicFiles, reload: reloadMusics } = useMusicFiles();
  const { files: photoFiles, reload: reloadPhotos } = usePhotoFiles();

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      update("avatarDataUrl", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const randomPhotoUrl = (avoid?: string | null): string | null => {
    if (photoFiles.length === 0) return null;
    const avoidFile = photoFileName(avoid);
    const pool =
      avoidFile && photoFiles.length > 1
        ? photoFiles.filter((file) => file !== avoidFile)
        : photoFiles;
    const file = pool[Math.floor(Math.random() * pool.length)] ?? photoFiles[0];
    return `/fotos/${encodeURIComponent(file)}`;
  };

  const randomizeAvatar = () => {
    const url = randomPhotoUrl(config.avatarDataUrl);
    if (url) update("avatarDataUrl", url);
    else reloadPhotos();
  };

  // ===== Message list operations =====
  const updateMessage = (i: number, next: Message) => {
    const messages = config.messages.slice();
    messages[i] = next;
    update("messages", messages);
  };
  const deleteMessage = (i: number) => {
    if (config.messages.length <= 1) return;
    const id = config.messages[i]?.id;
    const messages = config.messages.filter((_, idx) => idx !== i);
    if (id) {
      setExpandedMessageIds(({ [id]: _removed, ...rest }) => rest);
    }
    update("messages", messages);
  };
  const toggleMessageSide = (i: number) => {
    const nextSide: MessageSide =
      config.messages[i].side === "sent" ? "received" : "sent";
    const nextMessage: Message = { ...config.messages[i], side: nextSide };
    updateMessage(i, nextMessage);
  };
  const addMessage = () => {
    const lastSide =
      config.messages[config.messages.length - 1]?.side ?? "sent";
    // Alternate sides by default for natural conversation flow
    const newSide: MessageSide = lastSide === "sent" ? "received" : "sent";
    const id = `m${Date.now()}`;
    const audioDefaults: MessageAudio =
      newSide === "received"
        ? { typingSfx: "none", appearSfx: "notification.mp3" }
        : {};
    update("messages", [
      ...config.messages,
      {
        id,
        side: newSide,
        text: "",
        typingDurationMs: newSide === "sent" ? 3000 : undefined,
        audio: Object.keys(audioDefaults).length > 0 ? audioDefaults : undefined,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Identity */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="space-y-4">
          {advancedOpen && (
            <Field label="Nome de usuário">
            <input
              type="text"
              value={config.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="ex: rodnobeatt"
              disabled={disabled}
              className="input"
            />
            </Field>
          )}
          {advancedOpen && (
            <Field label="Status / subtítulo">
            <input
              type="text"
              value={config.subtitle}
              onChange={(e) => update("subtitle", e.target.value)}
              placeholder="Ativo(a) agora"
              disabled={disabled}
              className="input"
            />
            </Field>
          )}
          <Field label="Foto de perfil">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-white/10 bg-ig-card">
                {config.avatarDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreviewUrl(config.avatarDataUrl)}
                    alt="avatar"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.src = config.avatarDataUrl ?? "";
                    }}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ig-muted">
                    <User className="h-9 w-9" />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.07]">
                  <Upload className="h-4 w-4" />
                  <span>Trocar foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={disabled}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={randomizeAvatar}
                  disabled={disabled || photoFiles.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Sortear foto de public/fotos"
                >
                  <Wand2 className="h-4 w-4" />
                  Aleatório
                </button>
              </div>
              {config.avatarDataUrl && (
                <button
                  type="button"
                  onClick={() => update("avatarDataUrl", null)}
                  className="text-xs text-ig-muted transition hover:text-white"
                  disabled={disabled}
                >
                  Remover
                </button>
              )}
            </div>
          </Field>
        </div>
      </section>

      {/* Messages */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquare className="h-4 w-4 text-ig-muted" /> Conversa
          </h2>
          <p className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-ig-muted">
            {config.messages.length} mensagens
          </p>
        </div>
        <div className="space-y-3">
          {config.messages.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              index={i}
              total={config.messages.length}
              disabled={disabled}
              editedMode={!!config.editedMode}
              advancedOpen={advancedOpen}
              expanded={!advancedOpen && !!expandedMessageIds[m.id]}
              onToggleExpanded={() =>
                setExpandedMessageIds((prev) => ({
                  ...prev,
                  [m.id]: !prev[m.id],
                }))
              }
              onRandomStoryPhoto={() => {
                const url = randomPhotoUrl(m.storyReply?.imageDataUrl);
                if (!url) {
                  reloadPhotos();
                  return;
                }
                updateMessage(i, {
                  ...m,
                  storyReply: {
                    ...(m.storyReply ?? { imageDataUrl: "" }),
                    imageDataUrl: url,
                  },
                });
              }}
              onChange={(next) => updateMessage(i, next)}
              onDelete={() => deleteMessage(i)}
              onToggleSide={() => toggleMessageSide(i)}
            />
          ))}
          <button
            type="button"
            onClick={addMessage}
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-sm font-medium text-ig-muted transition hover:border-white/30 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Adicionar mensagem
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-ig-muted transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white"
      >
        <Settings2 className="h-4 w-4" />
        {advancedOpen ? "Ocultar opções avançadas" : "Mostrar opções avançadas"}
      </button>

      {/* Profile card */}
      <section className={advancedOpen ? "" : "hidden"}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ig-muted">
          <Camera className="h-4 w-4" /> Card de perfil (acima da 1ª mensagem)
        </h2>
        <div className="space-y-4">
          <Toggle
            label="Exibir card com avatar grande, infos e 'Ver perfil'"
            checked={!!config.showProfileCard}
            disabled={disabled}
            onChange={(v) => update("showProfileCard", v)}
          />
          {config.showProfileCard && (
            <div className="space-y-5 pt-2">
              <Field label="Nome de exibição (negrito grande)">
                <input
                  type="text"
                  value={config.profileDisplayName ?? ""}
                  onChange={(e) =>
                    update("profileDisplayName", e.target.value)
                  }
                  placeholder="Rafael Siqueira"
                  disabled={disabled}
                  className="input"
                />
              </Field>
              <Toggle
                label="Exibir nome de usuário"
                checked={config.profileShowUsername ?? true}
                disabled={disabled}
                onChange={(v) => update("profileShowUsername", v)}
              />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Seguidores">
                  <input
                    type="text"
                    value={config.profileFollowers ?? ""}
                    onChange={(e) =>
                      update("profileFollowers", e.target.value)
                    }
                    placeholder="818"
                    disabled={disabled}
                    className="input"
                  />
                </Field>
                <Field label="Posts">
                  <input
                    type="text"
                    value={config.profilePosts ?? ""}
                    onChange={(e) => update("profilePosts", e.target.value)}
                    placeholder="3"
                    disabled={disabled}
                    className="input"
                  />
                </Field>
              </div>
              <Field label="Linhas de info (uma por linha)">
                <textarea
                  value={(config.profileFollowInfo ?? []).join("\n")}
                  onChange={(e) =>
                    update(
                      "profileFollowInfo",
                      e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                    )
                  }
                  rows={3}
                  placeholder={
                    "Vocês se seguem mutuamente no Instagram"
                  }
                  disabled={disabled}
                  className="input"
                />
              </Field>
              <Field label="Texto do botão">
                <input
                  type="text"
                  value={config.profileButtonLabel ?? ""}
                  onChange={(e) =>
                    update("profileButtonLabel", e.target.value)
                  }
                  placeholder="Ver perfil"
                  disabled={disabled}
                  className="input"
                />
              </Field>
            </div>
          )}
        </div>
      </section>

      {/* Edited video mode */}
      <section className={advancedOpen ? "" : "hidden"}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ig-muted">
          <Wand2 className="h-4 w-4" /> Vídeo editado
        </h2>
        <div className="space-y-3">
          <Toggle
            label="Modo vídeo editado (sons + efeitos virais)"
            checked={!!config.editedMode}
            disabled={disabled}
            onChange={(v) => update("editedMode", v)}
          />
          {config.editedMode && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 text-xs leading-relaxed text-ig-muted">
              <p className="mb-1 font-semibold text-white">
                Como funciona o áudio:
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>
                  Coloque seus arquivos em
                  {" "}<code className="text-purple-300">public/audio/</code>
                  {" "}(<code>.mp3 / .wav / .ogg</code>).
                </li>
                <li>
                  Em cada mensagem, abra o painel
                  {" "}<strong className="text-white">Áudio</strong>
                  {" "}para escolher qual arquivo toca em cada momento e
                  pré-ouvir com o botão{" "}
                  <span className="inline-block align-middle">▶</span>.
                </li>
                <li>
                  &quot;Padrão&quot; usa os nomes sugeridos abaixo; selecione
                  outro arquivo da lista pra trocar; &quot;Nenhum&quot;
                  silencia aquele momento.
                </li>
              </ul>
              <p className="mt-2 font-semibold text-white">
                Nomes-padrão (opcionais):
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                <li><code className="text-white">notification.mp3</code> - 3 pontinhos recebidos</li>
                <li><code className="text-white">whoosh.mp3</code> + <code className="text-white">pop.mp3</code> - zoom/impacto do balão recebido</li>
                <li><code className="text-white">keypress.mp3</code> - clique de tecla (por caractere)</li>
                <li><code className="text-white">typing-loop.mp3</code> - digitando contínuo (loop)</li>
                <li><code className="text-white">send.mp3</code> - mensagem enviada</li>
              </ul>
              <p className="mt-2 text-[11px]">
                Arquivos faltando são ignorados silenciosamente. O áudio é
                mesclado no vídeo gerado (MP4 com AAC quando suportado).
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Background music */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <Volume2 className="h-4 w-4 text-ig-muted" /> Música
        </h2>
        <div className="space-y-3">
          <BackgroundMusicPicker
            value={config.backgroundMusic ?? "none"}
            files={musicFiles}
            disabled={disabled}
            onReload={reloadMusics}
            onRandom={() => {
              if (musicFiles.length === 0) {
                reloadMusics();
                return;
              }
              const current =
                config.backgroundMusic && config.backgroundMusic !== "none"
                  ? config.backgroundMusic
                  : undefined;
              const pool =
                current && musicFiles.length > 1
                  ? musicFiles.filter((file) => file !== current)
                  : musicFiles;
              update(
                "backgroundMusic",
                pool[Math.floor(Math.random() * pool.length)] ?? musicFiles[0]
              );
            }}
            onChange={(backgroundMusic) =>
              update("backgroundMusic", backgroundMusic)
            }
          />
          <MusicVolumeSlider
            value={Math.round((config.backgroundMusicGain ?? 0.3) * 100)}
            disabled={disabled || !config.backgroundMusic || config.backgroundMusic === "none"}
            onChange={(value) => update("backgroundMusicGain", value / 100)}
          />
        </div>
      </section>

      {/* Display */}
      <section className={advancedOpen ? "" : "hidden"}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ig-muted">
          <Camera className="h-4 w-4" /> Exibição
        </h2>
        <div className="space-y-3">
          <Toggle
            label="Mostrar topo do Instagram + barra do telefone"
            checked={config.showHeader}
            disabled={disabled}
            onChange={(v) => update("showHeader", v)}
          />
          {!config.showHeader && (
            <HiddenTopChromeBorderSlider
              value={config.hiddenTopChromeBorderPx ?? 150}
              disabled={disabled}
              onChange={(px) => update("hiddenTopChromeBorderPx", px)}
            />
          )}
          <Toggle
            label="Ring de story no avatar (gradiente IG)"
            checked={!!config.hasStory}
            disabled={disabled}
            onChange={(v) => update("hasStory", v)}
          />
          <Toggle
            label="Selo de verificado (azul)"
            checked={!!config.verified}
            disabled={disabled}
            onChange={(v) => update("verified", v)}
          />
          <Toggle
            label="Indicador online (bolinha verde)"
            checked={!!config.online}
            disabled={disabled}
            onChange={(v) => update("online", v)}
          />
          <Field label="Horário na barra de status">
            <input
              type="text"
              value={config.statusBarTime}
              onChange={(e) => update("statusBarTime", e.target.value)}
              placeholder="9:53"
              disabled={disabled}
              className="input"
            />
          </Field>
          <Field label="Horário acima da 1ª mensagem (só com resposta a story)">
            <input
              type="text"
              value={config.chatTimestamp ?? ""}
              onChange={(e) => update("chatTimestamp", e.target.value)}
              placeholder="4:56 PM"
              disabled={disabled}
              className="input"
            />
          </Field>
        </div>
      </section>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        :global(.input:focus) {
          border-color: rgba(255, 255, 255, 0.3);
        }
        :global(.input:disabled) {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ig-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  rows,
  disabled,
  className,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={className}
    />
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ig-border bg-ig-card px-4 py-3 text-sm transition hover:border-white/20">
      <span className="select-none">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 cursor-pointer accent-ig-purple"
      />
    </label>
  );
}

function HiddenTopChromeBorderSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (px: number) => void;
}) {
  return (
    <div className="rounded-lg border border-ig-border bg-ig-card/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span>Borda preta em cima/baixo</span>
        <span className="font-mono text-white">{value}px</span>
      </div>
      <input
        type="range"
        min={0}
        max={1200}
        step={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-ig-muted">
        <span>sem corte</span>
        <span>mais corte</span>
      </div>
    </div>
  );
}

function FocusZoomSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-ig-border bg-ig-card/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span className="inline-flex items-center gap-1.5">
          <ZoomIn className="h-3.5 w-3.5" />
          Intensidade do zoom
        </span>
        <span className="font-mono text-white">{value.toFixed(2)}x</span>
      </div>
      <input
        type="range"
        min={1.15}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-ig-muted">
        <span>sutil</span>
        <span>viral</span>
      </div>
    </div>
  );
}

function FocusZoomMsSlider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-ig-border bg-ig-card/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span>{label}</span>
        <span className="font-mono text-white">{value}ms</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={50}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

function FocusZoomPositionSlider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-ig-border bg-ig-card/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span>{label}</span>
        <span className="font-mono text-white">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

function MessageRow({
  message,
  index,
  total,
  disabled,
  editedMode,
  advancedOpen,
  expanded,
  onToggleExpanded,
  onRandomStoryPhoto,
  onChange,
  onDelete,
  onToggleSide,
}: {
  message: Message;
  index: number;
  total: number;
  disabled?: boolean;
  editedMode?: boolean;
  advancedOpen?: boolean;
  expanded?: boolean;
  onToggleExpanded: () => void;
  onRandomStoryPhoto: () => void;
  onChange: (next: Message) => void;
  onDelete: () => void;
  onToggleSide: () => void;
}) {
  const isSent = message.side === "sent";
  const isFirst = index === 0;
  const hasStory = !!message.storyReply;
  const memeFile = message.memeAfter?.file ?? message.memeOverlay?.file ?? null;
  const hasMeme = !!memeFile;
  const hasCallToAction = !!message.callToActionAfter;
  const showLocalExpand = !advancedOpen;
  const showAdvanced = !!advancedOpen || !!expanded;
  const showAttachmentStrip = isFirst || hasMeme || hasCallToAction;
  // First sent message has no keyboard simulation (its audio panel only
  // shows the appear/typing slot that applies to its side).
  const sentUsesKeyboard = isSent && index > 0;

  const handleStoryUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...message,
        storyReply: {
          ...(message.storyReply ?? {}),
          imageDataUrl: reader.result as string,
        },
      });
    };
    reader.readAsDataURL(file);
    // Allow re-uploading the same file later.
    e.target.value = "";
  };

  const enableStoryReply = () => {
    if (message.storyReply) return;
    onChange({
      ...message,
      storyReply: { imageDataUrl: "" },
    });
  };

  const removeStoryReply = () => {
    const { storyReply: _omit, ...rest } = message;
    onChange(rest);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-white/20">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleSide}
          disabled={disabled}
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isSent
              ? "bg-white text-black"
              : "bg-white/10 text-white hover:bg-white/15"
          }`}
        >
          <ArrowLeftRight className="h-3 w-3" />
          {isSent ? "Você" : "Pessoa"}
        </button>
        <AutoGrowTextarea
          value={message.text}
          onChange={(e) => onChange({ ...message, text: e.target.value })}
          placeholder={isSent ? "Sua mensagem..." : "Mensagem da outra pessoa..."}
          rows={1}
          disabled={disabled}
          className="min-h-[34px] min-w-[180px] flex-1 resize-none overflow-hidden rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm leading-relaxed text-white placeholder:text-ig-muted/50 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled || total <= 1}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-ig-muted transition hover:bg-white/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
            title={total <= 1 ? "Pelo menos 1 mensagem é obrigatória" : "Excluir"}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
          {showLocalExpand && (
            <button
              type="button"
              onClick={onToggleExpanded}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              title={expanded ? "Recolher mensagem" : "Expandir mensagem"}
            >
              {expanded ? "Recolher" : "Expandir"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>
      </div>
      {/* Per-message typing duration */}
      {showAdvanced && !isSent && (
        <TypingDurationSlider
          label="Tempo dos 3 pontinhos"
          value={message.typingDurationMs ?? 1800}
          disabled={disabled}
          onChange={(ms) =>
            onChange({ ...message, typingDurationMs: ms })
          }
        />
      )}
      {showAdvanced && sentUsesKeyboard && (
        <TypingDurationSlider
          label="Tempo digitando sua mensagem"
          value={message.typingDurationMs ?? defaultSentTypingDurationMs(message.text)}
          min={300}
          max={10000}
          disabled={disabled}
          onChange={(ms) =>
            onChange({ ...message, typingDurationMs: ms })
          }
        />
      )}

      {showAttachmentStrip && (
        <div className="border-t border-white/5 px-3 py-2">
          <div className="flex flex-wrap items-stretch gap-2">
            {isFirst &&
              (!hasStory ? (
                <button
                  type="button"
                  onClick={enableStoryReply}
                  disabled={disabled}
                  className="inline-flex min-h-[116px] items-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] font-medium text-ig-muted transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-24 w-16 items-center justify-center rounded-lg bg-black/20">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <span>Resposta a story</span>
                </button>
              ) : (
                <StoryReplyCard
                  storyReply={message.storyReply}
                  disabled={disabled}
                  onUpload={handleStoryUpload}
                  onRandom={onRandomStoryPhoto}
                  onRemove={removeStoryReply}
                />
              ))}
            {hasMeme && <MemeInfoChip file={memeFile} />}
            {hasCallToAction && <CallToActionInfoChip />}
          </div>
        </div>
      )}

      {showAdvanced && !isFirst && (
        <div className="border-t border-ig-border/60 px-3 py-2">
          <Toggle
            label="Resposta a story nesta mensagem"
            checked={hasStory}
            disabled={disabled}
            onChange={(checked) =>
              checked ? enableStoryReply() : removeStoryReply()
            }
          />
          {hasStory && (
            <div className="mt-2">
              <StoryReplyCard
                storyReply={message.storyReply}
                disabled={disabled}
                onUpload={handleStoryUpload}
                onRandom={onRandomStoryPhoto}
                onRemove={removeStoryReply}
              />
            </div>
          )}
        </div>
      )}

      {showAdvanced && editedMode && (
        <MessageFocusZoomPanel
          message={message}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {showAdvanced && editedMode && (
        <MemeAfterPanel
          message={message}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {showAdvanced && editedMode && (
        <MemeOverlayPanel
          message={message}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {showAdvanced && editedMode && (
        <CallToActionAfterPanel
          message={message}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {/* Per-message audio (edited mode only) */}
      {showAdvanced && editedMode && (
        <MessageAudioPanel
          message={message}
          isSent={isSent}
          sentUsesKeyboard={sentUsesKeyboard}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function StoryReplyCard({
  storyReply,
  disabled,
  onUpload,
  onRandom,
  onRemove,
}: {
  storyReply: Message["storyReply"];
  disabled?: boolean;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRandom: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-[260px] flex-1 items-center gap-3 rounded-lg border border-white/10 bg-black/15 p-2">
      <div className="relative h-24 w-16 flex-none overflow-hidden rounded-lg border border-white/10 bg-ig-card">
        {storyReply?.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoPreviewUrl(storyReply.imageDataUrl)}
            alt="story"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = storyReply.imageDataUrl;
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ig-muted">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
          <ImageIcon className="h-3.5 w-3.5 text-ig-muted" />
          Resposta a story
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.07]">
            <Upload className="h-3 w-3" />
            {storyReply?.imageDataUrl ? "Trocar" : "Enviar"}
            <input
              type="file"
              accept="image/*"
              onChange={onUpload}
              disabled={disabled}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={onRandom}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            title="Sortear foto de public/fotos"
          >
            <Wand2 className="h-3 w-3" />
            Aleatório
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-ig-muted transition hover:bg-white/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            title="Remover resposta a story"
          >
            <XIcon className="h-3 w-3" />
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

function MemeInfoChip({ file }: { file: string | null }) {
  return (
    <span className="inline-flex min-w-[170px] items-center gap-2 rounded-lg border border-purple-300/15 bg-purple-300/10 p-1.5 pr-2 text-[11px] font-medium text-purple-100">
      <span className="relative h-24 w-16 overflow-hidden rounded-lg bg-black/30">
        {file ? (
          <MemeThumbnail file={file} className="h-full w-full" iconSize="sm" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Play className="h-3 w-3" />
          </span>
        )}
      </span>
      Possui meme
    </span>
  );
}

function MemeThumbnail({
  file,
  className,
  iconSize = "md",
}: {
  file: string;
  className?: string;
  iconSize?: "sm" | "md";
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setReady(false);
    video.load();
  }, [file]);

  const revealFrame = (video: HTMLVideoElement) => {
    if (video.duration > 0 && video.readyState < 2) {
      try {
        video.currentTime = Math.min(0.1, video.duration / 2);
      } catch {
        /* Mobile browsers can reject early seeks until more metadata arrives. */
      }
    }
    void video
      .play()
      .then(() => {
        video.pause();
        setReady(true);
      })
      .catch(() => {
        setReady(video.readyState > 0);
      });
  };

  return (
    <>
      <video
        ref={videoRef}
        src={memeUrl(file)}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => revealFrame(e.currentTarget)}
        onLoadedData={(e) => {
          e.currentTarget.pause();
          setReady(true);
        }}
        onCanPlay={(e) => {
          e.currentTarget.pause();
          setReady(true);
        }}
        className={`${className ?? ""} object-cover ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Play className={iconSize === "sm" ? "h-3 w-3" : "h-4 w-4"} />
        </div>
      )}
    </>
  );
}

function CallToActionInfoChip() {
  return (
    <span className="inline-flex min-w-[168px] items-center gap-2 rounded-lg border border-sky-300/15 bg-sky-300/10 p-1 pr-2 text-[11px] font-medium text-sky-100">
      <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-puxe-assunto.png"
          alt="Puxe Assunto"
          className="max-h-full max-w-full object-contain"
        />
      </span>
      <span className="leading-tight">Possui chamada de ação</span>
    </span>
  );
}

function MessageFocusZoomPanel({
  message,
  disabled,
  onChange,
}: {
  message: Message;
  disabled?: boolean;
  onChange: (next: Message) => void;
}) {
  const enabled = !!message.focusZoomOnMessage;
  const audio: MessageAudio = message.audio ?? {};
  const { files } = useAudioFiles();

  const updateZoomAudio = (patch: Partial<MessageAudio>) => {
    const next: MessageAudio = { ...audio, ...patch };
    (Object.keys(next) as (keyof MessageAudio)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
      if (k !== "focusZoomSfx" && next[k] === "default") delete next[k];
    });
    const hasAny = Object.keys(next).length > 0;
    onChange({ ...message, audio: hasAny ? next : undefined });
  };

  const setEnabled = (nextEnabled: boolean) => {
    if (nextEnabled) {
      onChange({
        ...message,
        focusZoomOnMessage: true,
        focusZoomScale: message.focusZoomScale ?? 1.3,
        focusZoomDelayMs: message.focusZoomDelayMs ?? 0,
        focusZoomHoldMs: message.focusZoomHoldMs ?? 520,
        focusZoomOffsetX: message.focusZoomOffsetX ?? 0,
        focusZoomOffsetY: message.focusZoomOffsetY ?? 0,
      });
      return;
    }

    const {
      focusZoomOnMessage: _focusZoomOnMessage,
      focusZoomScale: _focusZoomScale,
      focusZoomDelayMs: _focusZoomDelayMs,
      focusZoomHoldMs: _focusZoomHoldMs,
      focusZoomOffsetX: _focusZoomOffsetX,
      focusZoomOffsetY: _focusZoomOffsetY,
      ...rest
    } = message;
    onChange(rest);
  };

  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <Toggle
        label="Zoom nesta mensagem"
        checked={enabled}
        disabled={disabled}
        onChange={setEnabled}
      />
      {enabled && (
        <div className="mt-2 space-y-2">
          <FocusZoomSlider
            value={message.focusZoomScale ?? 1.3}
            disabled={disabled}
            onChange={(focusZoomScale) =>
              onChange({ ...message, focusZoomScale })
            }
          />
          <FocusZoomMsSlider
            label="Tempo até zoom"
            value={message.focusZoomDelayMs ?? 0}
            min={0}
            max={5000}
            disabled={disabled}
            onChange={(focusZoomDelayMs) =>
              onChange({ ...message, focusZoomDelayMs })
            }
          />
          <FocusZoomMsSlider
            label="Tempo no zoom"
            value={message.focusZoomHoldMs ?? 520}
            min={100}
            max={6000}
            disabled={disabled}
            onChange={(focusZoomHoldMs) =>
              onChange({ ...message, focusZoomHoldMs })
            }
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FocusZoomPositionSlider
              label="Posição X"
              value={message.focusZoomOffsetX ?? 0}
              min={-600}
              max={600}
              disabled={disabled}
              onChange={(focusZoomOffsetX) =>
                onChange({ ...message, focusZoomOffsetX })
              }
            />
            <FocusZoomPositionSlider
              label="Posição Y"
              value={message.focusZoomOffsetY ?? 0}
              min={-900}
              max={900}
              disabled={disabled}
              onChange={(focusZoomOffsetY) =>
                onChange({ ...message, focusZoomOffsetY })
              }
            />
          </div>
          <SfxFilePicker
            label="Som no início exato do zoom"
            slot="focusZoom"
            value={audio.focusZoomSfx ?? "none"}
            files={files}
            disabled={disabled}
            onChange={(v) => updateZoomAudio({ focusZoomSfx: v })}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Per-message audio controls (edited mode)
// ============================================================

/** Fetches the list of photos available in /public/fotos/. */
function usePhotoFiles(): { files: string[]; reload: () => void } {
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fotos")
      .then((r) => r.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return { files, reload: () => setReloadKey((k) => k + 1) };
}

function photoFileName(value: string | null | undefined): string | undefined {
  if (!value?.startsWith("/fotos/")) return undefined;
  try {
    const file = decodeURIComponent(value.slice("/fotos/".length));
    if (file.includes("/") || file.includes("\\") || file.includes("..")) {
      return undefined;
    }
    return file;
  } catch {
    return undefined;
  }
}

function photoPreviewUrl(value: string | null | undefined): string {
  const file = photoFileName(value);
  if (!file) return value ?? "";
  const base = file.replace(/\.[^.]+$/, "");
  return `/fotos/thumbs/${encodeURIComponent(base)}.webp`;
}

/** Fetches the list of audio files available in /public/audio/. */
function useAudioFiles(): { files: string[]; reload: () => void } {
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/audio")
      .then((r) => r.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {
        /* ignore - empty list */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return { files, reload: () => setReloadKey((k) => k + 1) };
}

/** Fetches the list of music files available in /public/musics/. */
function useMusicFiles(): { files: string[]; reload: () => void } {
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/musics")
      .then((r) => r.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {
        /* ignore - empty list */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return { files, reload: () => setReloadKey((k) => k + 1) };
}

function BackgroundMusicPicker({
  value,
  files,
  disabled,
  onReload,
  onRandom,
  onChange,
}: {
  value: SfxChoice;
  files: string[];
  disabled?: boolean;
  onReload: () => void;
  onRandom: () => void;
  onChange: (v: SfxChoice) => void;
}) {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const previewUrl = value && value !== "none" ? musicFileToUrl(value) : null;
  const isPlaying = !!previewUrl && playingUrl === previewUrl;

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ url: string | null }>).detail;
      setPlayingUrl(detail?.url ?? null);
    };
    window.addEventListener("audio-preview-change", onChange);
    return () => window.removeEventListener("audio-preview-change", onChange);
  }, []);

  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="block text-xs font-medium text-ig-muted">
          Arquivo
        </span>
        <button
          type="button"
          onClick={onReload}
          disabled={disabled}
          className="text-[10px] text-ig-muted transition hover:text-white disabled:opacity-50"
          title="Reler a pasta /public/musics"
        >
          recarregar lista
        </button>
      </div>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SfxChoice)}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
        >
          <option value="none">Nenhuma música</option>
          {files.length > 0 && <option disabled>----------</option>}
          {files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRandom}
          disabled={disabled || files.length === 0}
          title="Sortear música de public/musics"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ig-muted transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Wand2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => previewUrl && togglePreviewAudio(previewUrl)}
          disabled={disabled || !previewUrl}
          title={previewUrl ? `${isPlaying ? "Pausar" : "Ouvir"} ${previewUrl}` : "Sem música para ouvir"}
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-ig-muted transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
      {files.length === 0 && (
        <p className="mt-2 text-[10px] text-ig-muted">
          Nenhum arquivo encontrado em <code>public/musics/</code>.
        </p>
      )}
    </label>
  );
}

function MusicVolumeSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span>Volume</span>
        <span className="font-mono text-white">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

/** Plays a single audio file (one shared HTMLAudioElement so previews
 *  cancel each other). */
function previewAudio(url: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __sfxPreview?: HTMLAudioElement };
  let el = w.__sfxPreview;
  if (!el) {
    el = new Audio();
    w.__sfxPreview = el;
  }
  el.pause();
  el.src = url;
  el.currentTime = 0;
  void el.play().catch(() => {
    /* ignore - user gesture missing or file 404 */
  });
}

function togglePreviewAudio(url: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __sfxPreview?: HTMLAudioElement };
  let el = w.__sfxPreview;
  if (!el) {
    el = new Audio();
    w.__sfxPreview = el;
    el.addEventListener("ended", () => notifyPreviewAudio(null));
  }
  if (el.src === new URL(url, window.location.href).href && !el.paused) {
    el.pause();
    notifyPreviewAudio(null);
    return;
  }
  el.pause();
  el.src = url;
  el.currentTime = 0;
  void el
    .play()
    .then(() => notifyPreviewAudio(url))
    .catch(() => notifyPreviewAudio(null));
}

function notifyPreviewAudio(url: string | null) {
  window.dispatchEvent(
    new CustomEvent("audio-preview-change", { detail: { url } })
  );
}

function useMemeFiles(): { files: string[]; reload: () => void } {
  const [files, setFiles] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/memes")
      .then((r) => r.json())
      .then((data: { files?: string[] }) => {
        if (!cancelled && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {
        /* ignore - empty list */
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return { files, reload: () => setReloadKey((k) => k + 1) };
}

function memeUrl(file: string): string {
  return `/memes/${encodeURIComponent(file)}`;
}

function MemeAfterPanel({
  message,
  disabled,
  onChange,
}: {
  message: Message;
  disabled?: boolean;
  onChange: (next: Message) => void;
}) {
  const { files, reload } = useMemeFiles();
  const selected = message.memeAfter?.file ?? "";

  const selectMeme = (file: string) => {
    onChange({ ...message, memeAfter: { file } });
  };

  const clearMeme = () => {
    const { memeAfter: _omit, ...rest } = message;
    onChange(rest);
  };

  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ig-muted">
          <ImageIcon className="h-3.5 w-3.5" />
          {message.side === "sent" ? "Meme após enviar" : "Meme após receber"}
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={disabled}
          className="text-[10px] text-ig-muted underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
          title="Reler a pasta /public/memes"
        >
          recarregar lista
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={clearMeme}
          disabled={disabled || !selected}
          className={`flex min-h-[84px] flex-col items-center justify-center rounded-lg border px-2 py-2 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            !selected
              ? "border-ig-purple bg-ig-purple/15 text-white"
              : "border-ig-border bg-ig-card text-ig-muted hover:border-white/20 hover:text-white"
          }`}
        >
          Nenhum
        </button>
        {files.map((file) => {
          const active = selected === file;
          return (
            <button
              key={file}
              type="button"
              onClick={() => selectMeme(file)}
              disabled={disabled}
              className={`overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-ig-purple bg-ig-purple/15"
                  : "border-ig-border bg-ig-card hover:border-white/25"
              }`}
              title={file}
            >
              <div className="relative aspect-video bg-black">
                <MemeThumbnail file={file} className="h-full w-full" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                  <Play className="h-4 w-4 text-white drop-shadow" />
                </div>
              </div>
              <span className="block truncate px-2 py-1.5 text-[10px] text-white">
                {file.replace(/\.[^.]+$/, "")}
              </span>
            </button>
          );
        })}
      </div>
      {files.length === 0 && (
        <p className="mt-2 text-[10px] text-ig-muted">
          Nenhum arquivo encontrado em <code>public/memes/</code>.
        </p>
      )}
    </div>
  );
}

const DEFAULT_MEME_OVERLAY = {
  durationMs: 0,
  opacity: 0.45,
  x: 120,
  y: 520,
  width: 840,
  height: 480,
};

function MemeOverlayPanel({
  message,
  disabled,
  onChange,
}: {
  message: Message;
  disabled?: boolean;
  onChange: (next: Message) => void;
}) {
  const { files, reload } = useMemeFiles();
  const cfg = message.memeOverlay;
  const selected = cfg?.file ?? "";

  const update = (patch: Partial<NonNullable<Message["memeOverlay"]>>) => {
    if (!cfg?.file && !patch.file) return;
    onChange({
      ...message,
      memeOverlay: {
        file: cfg?.file ?? patch.file ?? "",
        durationMs: cfg?.durationMs ?? DEFAULT_MEME_OVERLAY.durationMs,
        opacity: cfg?.opacity ?? DEFAULT_MEME_OVERLAY.opacity,
        x: cfg?.x ?? DEFAULT_MEME_OVERLAY.x,
        y: cfg?.y ?? DEFAULT_MEME_OVERLAY.y,
        width: cfg?.width ?? DEFAULT_MEME_OVERLAY.width,
        height: cfg?.height ?? DEFAULT_MEME_OVERLAY.height,
        ...patch,
      },
    });
  };

  const selectMeme = (file: string) => {
    update({ file });
  };

  const clearMeme = () => {
    const { memeOverlay: _omit, ...rest } = message;
    onChange(rest);
  };

  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ig-muted">
          <ImageIcon className="h-3.5 w-3.5" />
          Meme sobreposto
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={disabled}
          className="text-[10px] text-ig-muted underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
          title="Reler a pasta /public/memes"
        >
          recarregar lista
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={clearMeme}
          disabled={disabled || !selected}
          className={`flex min-h-[84px] flex-col items-center justify-center rounded-lg border px-2 py-2 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            !selected
              ? "border-ig-purple bg-ig-purple/15 text-white"
              : "border-ig-border bg-ig-card text-ig-muted hover:border-white/20 hover:text-white"
          }`}
        >
          Nenhum
        </button>
        {files.map((file) => {
          const active = selected === file;
          return (
            <button
              key={file}
              type="button"
              onClick={() => selectMeme(file)}
              disabled={disabled}
              className={`overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-ig-purple bg-ig-purple/15"
                  : "border-ig-border bg-ig-card hover:border-white/25"
              }`}
              title={file}
            >
              <div className="relative aspect-video bg-black">
                <MemeThumbnail file={file} className="h-full w-full" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                  <Play className="h-4 w-4 text-white drop-shadow" />
                </div>
              </div>
              <span className="block truncate px-2 py-1.5 text-[10px] text-white">
                {file.replace(/\.[^.]+$/, "")}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MemeOverlaySlider
            label="Duração"
            value={cfg?.durationMs ?? DEFAULT_MEME_OVERLAY.durationMs}
            min={0}
            max={10000}
            step={100}
            suffix="ms"
            zeroLabel="vídeo inteiro"
            disabled={disabled}
            onChange={(durationMs) => update({ durationMs })}
          />
          <MemeOverlaySlider
            label="Opacidade"
            value={Math.round((cfg?.opacity ?? DEFAULT_MEME_OVERLAY.opacity) * 100)}
            min={10}
            max={100}
            step={5}
            suffix="%"
            disabled={disabled}
            onChange={(opacity) => update({ opacity: opacity / 100 })}
          />
          <MemeOverlaySlider
            label="X"
            value={cfg?.x ?? DEFAULT_MEME_OVERLAY.x}
            min={-300}
            max={1080}
            step={10}
            suffix="px"
            disabled={disabled}
            onChange={(x) => update({ x })}
          />
          <MemeOverlaySlider
            label="Y"
            value={cfg?.y ?? DEFAULT_MEME_OVERLAY.y}
            min={-300}
            max={1920}
            step={10}
            suffix="px"
            disabled={disabled}
            onChange={(y) => update({ y })}
          />
          <MemeOverlaySlider
            label="Largura"
            value={cfg?.width ?? DEFAULT_MEME_OVERLAY.width}
            min={120}
            max={1080}
            step={10}
            suffix="px"
            disabled={disabled}
            onChange={(width) => update({ width })}
          />
          <MemeOverlaySlider
            label="Altura"
            value={cfg?.height ?? DEFAULT_MEME_OVERLAY.height}
            min={120}
            max={1600}
            step={10}
            suffix="px"
            disabled={disabled}
            onChange={(height) => update({ height })}
          />
        </div>
      )}

      {files.length === 0 && (
        <p className="mt-2 text-[10px] text-ig-muted">
          Nenhum arquivo encontrado em <code>public/memes/</code>.
        </p>
      )}
    </div>
  );
}

function MemeOverlaySlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  zeroLabel,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  zeroLabel?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const display = zeroLabel && value === 0 ? zeroLabel : `${value}${suffix}`;
  return (
    <div className="rounded-lg border border-ig-border bg-ig-card/50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span>{label}</span>
        <span className="font-mono text-white">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

function CallToActionAfterPanel({
  message,
  disabled,
  onChange,
}: {
  message: Message;
  disabled?: boolean;
  onChange: (next: Message) => void;
}) {
  const enabled = !!message.callToActionAfter;
  const cfg = message.callToActionAfter;

  const setEnabled = (next: boolean) => {
    if (next) {
      onChange({
        ...message,
        callToActionAfter: {
          domain: cfg?.domain ?? "puxeassunto.com",
          suggestedResponse: cfg?.suggestedResponse ?? "",
          responseAlternatives: cfg?.responseAlternatives ?? ["", "", "", ""],
          siteTagline:
            cfg?.siteTagline ??
            "Insira o print da conversa e nós sugerimos a resposta perfeita.",
        },
      });
      return;
    }
    const { callToActionAfter: _omit, ...rest } = message;
    onChange(rest);
  };

  const update = (
    patch: Partial<NonNullable<Message["callToActionAfter"]>>
  ) => {
    onChange({
      ...message,
      callToActionAfter: { ...(cfg ?? {}), ...patch },
    });
  };

  const updateAlternative = (index: number, value: string) => {
    const next = [...(cfg?.responseAlternatives ?? ["", "", "", ""])];
    while (next.length < 4) next.push("");
    next[index] = value;
    update({ responseAlternatives: next });
  };

  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ig-muted">
          <Search className="h-3.5 w-3.5" />
          Chamada de ação após
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-ig-muted">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-ig-purple"
          />
          ativar
        </label>
      </div>

      {enabled && (
        <div className="mt-2 space-y-2">
          <p className="rounded-md border border-purple-500/20 bg-purple-500/5 px-2 py-1.5 text-[11px] leading-relaxed text-ig-muted">
            Após esta mensagem aparecer no Direct, simula um print da tela,
            abre o Safari, pesquisa <code className="text-white">{cfg?.domain || "puxeassunto.com"}</code>,
            acessa o site e mostra a resposta sugerida. A próxima mensagem
            enviada será a resposta &quot;copiada&quot;. Depois disso a conversa
            continua normalmente.
          </p>

          <Field label="Domínio digitado no Safari">
            <input
              type="text"
              value={cfg?.domain ?? ""}
              onChange={(e) => update({ domain: e.target.value })}
              placeholder="puxeassunto.com"
              disabled={disabled}
              className="input"
            />
          </Field>

          <Field label="Resposta sugerida no site (deixe vazio para usar a próxima mensagem)">
            <textarea
              value={cfg?.suggestedResponse ?? ""}
              onChange={(e) =>
                update({ suggestedResponse: e.target.value })
              }
              placeholder="Vazio = usa o texto da próxima mensagem"
              rows={2}
              disabled={disabled}
              className="input"
            />
          </Field>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Field key={index} label={`Resposta ${index + 1}`}>
                <textarea
                  value={cfg?.responseAlternatives?.[index] ?? ""}
                  onChange={(e) => updateAlternative(index, e.target.value)}
                  placeholder={
                    index === 2
                      ? "Vazio = usa a resposta sugerida"
                      : "Vazio = gera uma alternativa"
                  }
                  rows={2}
                  disabled={disabled}
                  className="input"
                />
              </Field>
            ))}
          </div>

          <Field label="Subtítulo do site (tagline)">
            <input
              type="text"
              value={cfg?.siteTagline ?? ""}
              onChange={(e) => update({ siteTagline: e.target.value })}
              placeholder="Insira o print da conversa e nós sugerimos a resposta perfeita."
              disabled={disabled}
              className="input"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function MessageAudioPanel({
  message,
  isSent,
  sentUsesKeyboard,
  disabled,
  onChange,
}: {
  message: Message;
  isSent: boolean;
  sentUsesKeyboard: boolean;
  disabled?: boolean;
  onChange: (next: Message) => void;
}) {
  const audio: MessageAudio = message.audio ?? {};
  const { files, reload } = useAudioFiles();

  const updateAudio = (patch: Partial<MessageAudio>) => {
    const next: MessageAudio = { ...audio, ...patch };
    (Object.keys(next) as (keyof MessageAudio)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
      if (k !== "focusZoomSfx" && next[k] === "default") delete next[k];
    });
    const hasAny = Object.keys(next).length > 0;
    onChange({ ...message, audio: hasAny ? next : undefined });
  };

  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ig-muted">
          <Volume2 className="h-3.5 w-3.5" />
          Áudio (modo editado)
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={disabled}
          className="text-[10px] text-ig-muted underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
          title="Reler a pasta /public/audio"
        >
          recarregar lista
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!isSent && (
          <>
            <SfxFilePicker
              label="Som dos 3 pontinhos"
              slot="receivedTyping"
              value={audio.typingSfx ?? "none"}
              files={files}
              disabled={disabled}
              onChange={(v) => updateAudio({ typingSfx: v })}
            />
            <SfxFilePicker
              label="Som ao aparecer balão"
              slot="receivedAppearWhoosh"
              value={audio.appearSfx ?? "notification.mp3"}
              files={files}
              disabled={disabled}
              onChange={(v) => updateAudio({ appearSfx: v })}
              defaultLabelOverride="notification.mp3"
            />
          </>
        )}
        {isSent && sentUsesKeyboard && (
          <>
            <ModeSelect
              label="Modo de digitação"
              value={audio.typingMode ?? "default"}
              disabled={disabled}
              onChange={(v) => updateAudio({ typingMode: v })}
            />
            {(audio.typingMode ?? "default") === "loop" && (
              <SfxFilePicker
                label="Som do loop"
                slot="sentTypingLoop"
                value={audio.typingLoopSfx ?? "default"}
                files={files}
                disabled={disabled}
                onChange={(v) => updateAudio({ typingLoopSfx: v })}
              />
            )}
            <SfxFilePicker
              label="Som de enviar"
              slot="sentSend"
              value={audio.sendSfx ?? "default"}
              files={files}
              disabled={disabled}
              onChange={(v) => updateAudio({ sendSfx: v })}
            />
          </>
        )}
        {isSent && !sentUsesKeyboard && (
          <p className="text-[11px] text-ig-muted">
            A 1ª mensagem enviada não passa pelo teclado, então não tem
            sons de digitação. Os sons de pop aparecem só nas
            mensagens recebidas.
          </p>
        )}
      </div>
      {files.length === 0 && (
        <p className="mt-2 text-[10px] text-ig-muted">
          Nenhum arquivo encontrado em <code>public/audio/</code>. Coloque
          arquivos <code>.mp3 / .wav / .ogg</code> e clique em
          &quot;recarregar lista&quot;.
        </p>
      )}
    </div>
  );
}

/**
 * File picker for a single SFX slot. Lists every file in /public/audio/ plus
 * the special "Padrão" / "Nenhum" entries, and shows a ▶ button that previews
 * the currently-selected file.
 */
function SfxFilePicker({
  label,
  slot,
  value,
  files,
  disabled,
  onChange,
  defaultLabelOverride,
}: {
  label: string;
  slot: SfxSlot;
  value: SfxChoice;
  files: string[];
  disabled?: boolean;
  onChange: (v: SfxChoice) => void;
  /** Custom text to show after "Padrão" - useful for the appear-bubble slot
   *  whose default is two files (whoosh + pop). */
  defaultLabelOverride?: string;
}) {
  const defaultLabel = defaultLabelOverride ?? SLOT_DEFAULT_LABEL[slot];
  const previewUrl =
    value === "default"
      ? fileToUrl(DEFAULT_SFX[slot])
      : value === "none"
      ? null
      : fileToUrl(value);

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-ig-muted">
        {label}
      </span>
      <div className="flex gap-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as SfxChoice)}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-md border border-ig-border bg-ig-card px-2 py-1.5 text-[12px] text-white focus:border-ig-purple focus:outline-none disabled:opacity-50"
        >
          <option value="default">Padrão ({defaultLabel})</option>
          <option value="none">Nenhum (silêncio)</option>
          {files.length > 0 && <option disabled>----------</option>}
          {files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => previewUrl && previewAudio(previewUrl)}
          disabled={disabled || !previewUrl}
          title={previewUrl ? `Ouvir ${previewUrl}` : "Sem áudio para ouvir"}
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md border border-ig-border bg-ig-card text-ig-muted transition hover:border-ig-purple hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      </div>
    </label>
  );
}

function ModeSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: TypingSoundMode;
  disabled?: boolean;
  onChange: (v: TypingSoundMode) => void;
}) {
  const options: Array<{ value: TypingSoundMode; label: string }> = [
    { value: "default", label: "Padrão (por tecla)" },
    { value: "perKey", label: "1 som por tecla" },
    { value: "loop", label: "Loop contínuo" },
    { value: "none", label: "Nenhum (silêncio)" },
  ];
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-ig-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TypingSoundMode)}
        disabled={disabled}
        className="w-full rounded-md border border-ig-border bg-ig-card px-2 py-1.5 text-[12px] text-white focus:border-ig-purple focus:outline-none disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Slider for the per-message typing-indicator duration. Same look-and-feel
 * as the old global slider (0.5s - 6.0s). Always sets a numeric value on
 * `Message.typingDurationMs` (no MS input needed).
 */
function TypingDurationSlider({
  label = "Tempo de digitação",
  value,
  min = 500,
  max = 6000,
  disabled,
  onChange,
}: {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (ms: number) => void;
}) {
  return (
    <div className="border-t border-ig-border/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-ig-muted">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-mono text-white">
          {(value / 1000).toFixed(1)}s
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-ig-muted">
        <span>{(min / 1000).toFixed(1)}s</span>
        <span>{(max / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}

function defaultSentTypingDurationMs(text: string): number {
  void text;
  return 3000;
}
