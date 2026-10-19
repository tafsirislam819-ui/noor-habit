import { Bell, BellRing } from "lucide-react";
import { nextMode, type NotifyMode } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Two quick-settings style icons; the active one glows. Turning one on turns the other off. */
export function NotifyToggle({ mode, onChange }: { mode: NotifyMode; onChange: (m: NotifyMode) => void }) {
  const t = useT();
  const btn = (m: "normal" | "aggressive", Icon: typeof Bell) => (
    <button
      type="button"
      aria-label={t(m)}
      aria-pressed={mode === m}
      onClick={(e) => {
        e.stopPropagation();
        onChange(nextMode(mode, m));
      }}
      className={cn(
        "grid size-8 place-items-center rounded-full transition-all",
        mode === m ? "glow-on" : "bg-secondary text-muted-foreground opacity-60",
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
