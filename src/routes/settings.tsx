import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, ZoomIn, Move, Check, Volume2, Clock, Bell, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  useApp,
  THEMES,
  formatAppTime,
  type Profile,
  type TimeFormat,
  type RemindTone,
  type AggressiveTone,
} from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { Field } from "@/components/AppShell";
import { requestPermission, playTone } from "@/lib/notify";
import { APP_VERSION, checkForUpdate, openUpdate, type UpdateInfo } from "@/lib/update";
import { cn } from "@/lib/utils";
import { getNativeReelsStats, setNativeReelsAlertLimit, setNativeReelsThemeColor } from "@/lib/native-reels";
import { syncStatsToCloud } from "@/lib/supabase";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Noor Habit" },
      { name: "description", content: "Notifications, themes, language, time format and updates." },
      { property: "og:title", content: "Settings — Noor Habit" },
      { property: "og:description", content: "Notifications, themes, language, time format and updates." },
    ],
  }),
  component: SettingsPage,
});

const SWATCH: Record<string, string> = {
  midnight: "oklch(0.62 0.2 280)",
  aurora: "oklch(0.75 0.14 185)",
  ember: "oklch(0.72 0.19 50)",
  rose: "oklch(0.7 0.19 0)",
  emerald: "oklch(0.74 0.16 160)",
  light: "oklch(0.95 0.02 270)",
};

function SettingsPage() {
  const t = useT();
  const s = useApp();
  const [p, setP] = useState<Profile>(s.profile ?? { name: "", birth: "", goal: "" });
  const [upd, setUpd] = useState<UpdateInfo | null | "none" | "err">(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [reelsLimit, setReelsLimit] = useState(() => getNativeReelsStats().reelsAlertLimit ?? 30);
  const [reelsLimitDraft, setReelsLimitDraft] = useState(() => String(getNativeReelsStats().reelsAlertLimit ?? 30));

  // Advanced Avatar Cropper State
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);

  const themeHex: Record<string, string> = { midnight: "#8B5CF6", aurora: "#34D399", ember: "#F97316", rose: "#F43F5E", emerald: "#10B981", light: "#6366F1" };

  const remindToneOptions: { id: RemindTone; labelBn: string; labelEn: string }[] = [
    { id: "gentle_bell", labelBn: "শান্ত ঘণ্টার ধ্বনি (Gentle Bell)", labelEn: "Gentle Bell" },
    { id: "soft_chime", labelBn: "মধুর ঝংকার (Soft Chime)", labelEn: "Soft Chime" },
    { id: "mellow_beep", labelBn: "মৃদু বিপ (Mellow Beep)", labelEn: "Mellow Beep" },
  ];

  const aggressiveToneOptions: { id: AggressiveTone; labelBn: string; labelEn: string }[] = [
    { id: "pulse_radar", labelBn: "পালস রাডার (Pulse Radar)", labelEn: "Pulse Radar" },
    { id: "continuous_alarm", labelBn: "সাইরেন অ্যালার্ম (Continuous Siren)", labelEn: "Continuous Siren" },
    { id: "urgent_ping", labelBn: "জরুরি সংকেত (Urgent Ping)", labelEn: "Urgent Ping" },
  ];

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (p.name.trim()) {
      s.setProfile(p);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);

      if (s.authUser) {
        let st = 0;
        const d = new Date();
        for (let i = 0; i < 60; i++) {
          const prev = new Date();
          prev.setDate(d.getDate() - (i + 1));
          const z = new Date(prev.getTime() - prev.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
          if (s.prayers.every((pr) => (pr.doneDates || []).includes(z))) st++;
          else break;
        }
        await syncStatsToCloud(s.authUser, p.name, s.prayers, s.items, st, p.avatar);
      }
    }
  };

  // Process File Select -> Open Cropper Modal
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      window.alert(s.lang === "bn" ? "ছবিটি ১০ এমবির চেয়ে ছোট হতে হবে" : "Choose an image smaller than 10 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(String(reader.result || ""));
      setPan({ x: 0, y: 0 });
      setZoom(1);
      setCropperOpen(true);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  // Dragging handlers for crop positioning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStartRef.current.x,
      y: e.touches[0].clientY - dragStartRef.current.y,
    });
  };

  // Generate perfect 512x512 square crop on Canvas
  const handleSaveCrop = () => {
    if (!rawImageSrc) return;
    const img = imageRef.current;
    if (!img) return;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Viewport dimensions in cropper UI: 256x256
    const viewSize = 256;
    const ratio = 512 / viewSize;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    // Translate to center of 512x512
    ctx.translate(256, 256);
    // Apply pan and zoom scaled by 512/256 = 2
    ctx.translate(pan.x * ratio, pan.y * ratio);
    ctx.scale(zoom, zoom);

    // Natural aspect ratio calculation to prevent any distortion ("chepta")
    const imgWidth = img.naturalWidth || 512;
    const imgHeight = img.naturalHeight || 512;
    const baseScale = Math.max(viewSize / imgWidth, viewSize / imgHeight) * ratio;

    const renderW = imgWidth * baseScale;
    const renderH = imgHeight * baseScale;

    ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();

    const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setP((prev) => {
      const updated = { ...prev, avatar: croppedDataUrl, avatarZoom: 1 };
      s.setProfile(updated);
      if (s.authUser) {
        syncStatsToCloud(s.authUser, updated.name, s.prayers, s.items, 0, croppedDataUrl);
      }
      return updated;
    });

    setCropperOpen(false);
    setRawImageSrc(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold">{t("settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {s.lang === "bn"
            ? "সময় ফরম্যাট, নোটিফিকেশন টোন, থিম ও ভাষা পছন্দমতো সাজান"
            : "Customize time format, notification tones, themes and language"}
        </p>
      </header>

      {/* 1. TIME FORMAT (12-HOUR vs 24-HOUR) */}
      <section className="glass p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="size-4 text-primary" />
          <h2 className="font-semibold text-base">{t("timeFormat")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {s.lang === "bn"
            ? "অ্যাপের সকল নামাজ, রুটিন ও অভ্যাসের সময় প্রদর্শনের ফরম্যাট নির্বাচন করুন।"
            : "Select time display style across all prayers and scheduled habits."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => s.setTimeFormat("12h")}
            className={cn(
              "flex flex-col items-center justify-center p-3.5 rounded-2xl border transition text-center",
              s.timeFormat === "12h"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                : "border-border/60 bg-secondary/40 hover:bg-secondary"
            )}
          >
            <span className="font-bold text-base text-foreground">
              {formatAppTime("17:45", "12h", s.lang)}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {t("timeFormat12")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => s.setTimeFormat("24h")}
            className={cn(
              "flex flex-col items-center justify-center p-3.5 rounded-2xl border transition text-center",
              s.timeFormat === "24h"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                : "border-border/60 bg-secondary/40 hover:bg-secondary"
            )}
          >
            <span className="font-bold text-base text-foreground">
              {formatAppTime("17:45", "24h", s.lang)}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {t("timeFormat24")}
            </span>
          </button>
        </div>
      </section>

      {/* 2. NOTIFICATIONS & REMINDER TONES */}
      <section className="glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">{t("notifPerm")}</h2>
            <p className="text-xs text-muted-foreground">
              {s.notificationsEnabled ? t("notifEnabled") : t("notifDisabled")}
            </p>
          </div>
          <NotifyToggle />
        </div>

        {/* Remind Tone Selection */}
        <div className="border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Volume2 className="size-4 text-primary" />
            <span className="text-sm font-semibold">{t("remindTone")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {remindToneOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  s.setRemindTone(opt.id);
                  playTone(opt.id);
                }}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition",
                  s.remindTone === opt.id
                    ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                    : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                )}
              >
                <span>{s.lang === "bn" ? opt.labelBn : opt.labelEn}</span>
                {s.remindTone === opt.id && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </div>

        {/* Aggressive Tone Selection */}
        <div className="border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="size-4 text-warning" />
            <span className="text-sm font-semibold">{t("aggressiveTone")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {aggressiveToneOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  s.setAggressiveTone(opt.id);
                  playTone(opt.id);
                }}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium transition",
                  s.aggressiveTone === opt.id
                    ? "border-warning bg-warning/10 text-warning font-bold shadow-xs"
                    : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                )}
              >
                <span>{s.lang === "bn" ? opt.labelBn : opt.labelEn}</span>
                {s.aggressiveTone === opt.id && <Check className="size-3.5 text-warning" />}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. LANGUAGE */}
      <section className="glass flex items-center justify-between p-5">
        <div>
          <h2 className="font-semibold text-base">{t("language")}</h2>
          <p className="text-xs text-muted-foreground">
            {s.lang === "bn" ? "বর্তমানে স্মার্ট বাংলা সক্রিয়" : "Currently English is active"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => s.setLang("bn")}
            className={cn(
              "rounded-xl px-4 py-2 font-medium text-xs transition",
              s.lang === "bn" ? "glow-on bg-primary text-primary-foreground font-bold" : "bg-secondary hover:bg-muted"
            )}
          >
            বাংলা
          </button>
          <button
            onClick={() => s.setLang("en")}
            className={cn(
              "rounded-xl px-4 py-2 font-medium text-xs transition",
              s.lang === "en" ? "glow-on bg-primary text-primary-foreground font-bold" : "bg-secondary hover:bg-muted"
            )}
          >
            English
          </button>
        </div>
      </section>

      {/* 4. THEMES */}
      <section className="glass flex flex-col gap-3 p-5">
        <h2 className="font-semibold text-base">{t("theme")}</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {THEMES.map((themeKey) => {
            const active = s.theme === themeKey;
            return (
              <button
                key={themeKey}
                onClick={() => {
                  s.setTheme(themeKey);
                  const hex = themeHex[themeKey];
                  if (hex) setNativeReelsThemeColor(hex);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-semibold capitalize transition",
                  active ? "border-primary bg-primary/10 shadow-sm" : "border-border/60 hover:bg-secondary/50"
                )}
              >
                <span
                  className="size-4 rounded-full border border-black/20 shrink-0"
                  style={{ background: SWATCH[themeKey] }}
                />
                <span className="truncate">{t(themeKey as never)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. PROFILE & ADVANCED CROPPER */}
      <form className="glass flex flex-col gap-3.5 p-5" onSubmit={handleSaveProfile}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">{t("profile")}</h2>
          {savedBanner && (
            <span className="text-xs text-success flex items-center gap-1 font-semibold animate-in fade-in">
              <Check className="size-3.5" />
              {s.lang === "bn" ? "সংরক্ষিত হয়েছে!" : "Saved successfully!"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="size-20 border-2 border-primary/40 shadow-md">
              {p.avatar ? (
                <AvatarImage src={p.avatar} alt={p.name || "Profile"} className="size-full object-cover rounded-full" />
              ) : null}
              <AvatarFallback className="bg-secondary text-xl font-bold">
                {p.name?.trim()?.charAt(0)?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition">
              <Camera className="size-4" />
              {p.avatar
                ? (s.lang === "bn" ? "ছবি পরিবর্তন করুন" : "Change photo")
                : (s.lang === "bn" ? "প্রোফাইল ছবি যোগ করুন" : "Add profile photo")}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFileChange}
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              {s.lang === "bn"
                ? "ছবি আপলোড করে ড্র্যাগ ও জুম করে নিখুঁত ফ্রেম করুন"
                : "Upload, drag and zoom to perfectly frame your photo"}
            </p>
          </div>
        </div>

        <Field label={t("name")}>
          <input
            className="input"
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
            placeholder={s.lang === "bn" ? "আপনার নাম" : "Your Name"}
          />
        </Field>
        <Field label={t("birth")}>
          <input
            type="date"
            className="input"
            value={p.birth}
            onChange={(e) => setP({ ...p, birth: e.target.value })}
          />
        </Field>
        <Field label={t("mainGoal")}>
          <input
            className="input"
            value={p.goal}
            onChange={(e) => setP({ ...p, goal: e.target.value })}
            placeholder={s.lang === "bn" ? "আপনার মূল লক্ষ্য লিখুন" : "Your main goal"}
          />
        </Field>
        <button
          type="submit"
          className="rounded-xl bg-primary py-3 font-semibold text-primary-foreground hover:opacity-90 transition shadow-sm"
        >
          {t("save")}
        </button>
      </form>

      {/* INTERACTIVE CROPPER MODAL (PAN & ZOOM 1:1 SQUARE) */}
      <Dialog open={cropperOpen} onOpenChange={setCropperOpen}>
        <DialogContent className="max-w-sm p-5 border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {s.lang === "bn" ? "প্রোফাইল ছবি ফ্রেম করুন" : "Frame Profile Picture"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {s.lang === "bn"
                ? "ছবিটি আঙুল দিয়ে টেনে যেকোনো দিকে সরান এবং জুম সামঞ্জস্য করুন।"
                : "Drag photo to reposition and use the zoom slider below."}
            </DialogDescription>
          </DialogHeader>

          {rawImageSrc && (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Circular Viewport Box */}
              <div
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
                className="relative size-64 overflow-hidden rounded-full border-4 border-primary shadow-2xl bg-black cursor-grab active:cursor-grabbing select-none"
              >
                <img
                  ref={imageRef}
                  src={rawImageSrc}
                  alt="Crop preview"
                  draggable={false}
                  className="pointer-events-none absolute max-w-none origin-center"
                  style={{
                    transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                    left: "50%",
                    top: "50%",
                    minWidth: "100%",
                    minHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>

              {/* Controls */}
              <div className="w-full space-y-2 px-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <ZoomIn className="size-3.5 text-primary" /> {s.lang === "bn" ? "জুম" : "Zoom"}
                  </span>
                  <span>{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                  <Move className="size-3" /> {s.lang === "bn" ? "যেকোনো দিকে টেনে ফ্রেম ঠিক করুন" : "Drag in any direction to frame"}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setCropperOpen(false)}
              className="rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
            >
              {s.lang === "bn" ? "বাতিল" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleSaveCrop}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:opacity-90 transition"
            >
              {s.lang === "bn" ? "সংরক্ষণ করুন" : "Save Photo"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. APP UPDATE */}
      <section className="glass flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Noor Habit</span>
          <span className="text-xs text-muted-foreground font-mono">v{APP_VERSION}</span>
        </div>
        <button
          onClick={async () => {
            try {
              setUpd((await checkForUpdate()) ?? "none");
            } catch {
              setUpd("err");
            }
          }}
          className="rounded-xl bg-secondary py-2.5 text-xs font-semibold hover:bg-muted transition"
        >
          {t("checkUpdate")}
        </button>
        {upd === "none" && <p className="text-xs text-success mt-1">{t("upToDate")}</p>}
        {upd === "err" && <p className="text-xs text-destructive mt-1">{t("offlineAi")}</p>}
        {upd && typeof upd === "object" && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-semibold">{t("updateAvail")}: v{upd.version}</p>
            <button
              onClick={() => openUpdate(upd)}
              className="rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground"
            >
              {t("download")}
            </button>
          </div>
        )}
      </section>
      <footer className="pb-2 pt-1 text-center text-xs text-muted-foreground" aria-label="App credit">
        Made by Tasrif Islam
      </footer>
    </div>
  );
}
