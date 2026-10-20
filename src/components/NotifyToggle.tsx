import { Bell, BellRing } from "lucide-react";
import { nextMode, type NotifyMode, useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface NotifyToggleProps {
  mode: NotifyMode;
  hasTime?: boolean;
  onChange: (m: NotifyMode) => void;
}

/** Two quick-settings style icons; the active one glows. Turning one on turns the other off. */
export function NotifyToggle({ mode, hasTime = true, onChange }: NotifyToggleProps) {
  const t = useT();
  const lang = useApp((s) => s.lang);

  const handleClick = (e: React.MouseEvent, m: "normal" | "aggressive") => {
    e.stopPropagation();
    if (!hasTime) {
      alert(
        lang === "bn"
          ? "⚠️ রিমাইন্ডার চালু করতে অনুগ্রহ করে আগে একটি সময় (Time) নির্ধারণ করুন।"
          : "⚠️ Please set a time before enabling reminders."
      );
      return;
    }
    onChange(nextMode(mode, m));
  };

  const btn = (m: "normal" | "aggressive", Icon: typeof Bell) => (
    <button
      type="button"
      aria-label={t(m)}
      aria-pressed={mode === m}
      onClick={(e) => handleClick(e, m)}
      title={!hasTime ? (lang === "bn" ? "আগে সময় দিন" : "Set time first") : t(m)}
      className={cn(
        "grid size-8 place-items-center rounded-full transition-all",
        mode === m ? "glow-on" : "bg-secondary text-muted-foreground opacity-60",
        !hasTime && "opacity-30 cursor-not-allowed"
      )}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      {btn("normal", Bell)}
      {btn("aggressive", BellRing)}
    </div>
  );
}
