import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp, type ItemKind } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { NotifyToggle } from "@/components/NotifyToggle";
import { requestPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan — Noor Habit" },
      { name: "description", content: "Add habits, goals and tasks with reminders." },
      { property: "og:title", content: "Plan — Noor Habit" },
      { property: "og:description", content: "Add habits, goals and tasks with reminders." },
    ],
  }),
  component: Plan,
});

function Plan() {
  const t = useT();
  const { items, addItem, removeItem, setItemNotify, setItemTime } = useApp();
  const [kind, setKind] = useState<ItemKind>("habit");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const tabs: [ItemKind, string][] = [["habit", t("habits")], ["goal", t("goals")], ["task", t("tasks")]];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t("plan")}</h1>
      <div className="glass flex gap-1 p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={cn("flex-1 rounded-xl py-2 text-sm", kind === k && "glow-on")}>{l}</button>
        ))}
      </div>
      <form
        className="glass flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addItem(kind, title.trim(), time);
          if (time) requestPermission();
          setTitle("");
          setTime("");
        }}
      >
        <input className="input" placeholder={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          <button className="shrink-0 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">{t("add")}</button>
        </div>
      </form>
      <ul className="flex flex-col gap-2">
        {items.filter((i) => i.kind === kind).map((i) => (
          <li key={i.id} className="glass flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate">{i.title}</p>
              <input type="time" value={i.time} onChange={(e) => setItemTime(i.id, e.target.value)} className="mt-1 bg-transparent text-xs text-muted-foreground" />
            </div>
            <NotifyToggle mode={i.notify} onChange={(m) => { setItemNotify(i.id, m); if (m !== "off") requestPermission(); }} />
            <button onClick={() => removeItem(i.id)} aria-label="delete" className="text-muted-foreground"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
