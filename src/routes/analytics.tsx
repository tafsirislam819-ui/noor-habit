import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Flame,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { useApp, today, PRAYERS, type PrayerKey } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Islamic Calendar — Noor Habit" },
      { name: "description", content: "Interactive calendar, missed prayers and habit analytics, Islamic events." },
      { property: "og:title", content: "Analytics & Islamic Calendar — Noor Habit" },
      { property: "og:description", content: "Interactive calendar, missed prayers and habit analytics, Islamic events." },
    ],
  }),
  component: Analytics,
});

/** Tabular Hijri calculation with moon sighting offset */
function getHijriInfo(date: Date, offsetDays: number = 0) {
  const d = new Date(date);
  d.setDate(d.getDate() + offsetDays);

  let day = d.getDate();
  let month = d.getMonth();
  let year = d.getFullYear();

  let m = month + 1;
  let y = year;
  if (m < 3) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;

  const z = jd - 1948084;
  const cyc = Math.floor(z / 10631);
  const rem = z - 10631 * cyc;
  const j = Math.floor((rem - 8.01 / 60.0) / (10631.0 / 30.0));
  const iy = 30 * cyc + j;
  const remYear = rem - Math.floor(j * (10631.0 / 30.0) + 8.01 / 60.0);
  let im = Math.floor((remYear + 28.5001) / 29.5);
  if (im === 13) im = 12;
  const id = remYear - Math.floor(29.5001 * im - 29);

  const hijriMonthNamesBn = [
    "মহররম", "সফর", "রবিউল আউয়াল", "রবিউস সানি",
    "জমাদিউল আউয়াল", "জমাদিউস সানি", "রজব", "শাবান",
    "রমজান", "শাওয়াল", "জিলকদ", "জিলহজ"
  ];

  const hDay = Math.max(1, Math.min(30, Math.round(id)));
  const hMonth = Math.max(1, Math.min(12, Math.round(im)));
  const hYear = Math.round(iy);

  return {
    day: hDay,
    month: hMonth,
    year: hYear,
    monthNameBn: hijriMonthNamesBn[hMonth - 1] || "",
    fullTextBn: `${hDay} ${hijriMonthNamesBn[hMonth - 1] || ""} ${hYear} হিজরি`,
  };
}

/** Check special Islamic event for a Hijri date or Friday */
function getIslamicEvent(date: Date, hDay: number, hMonth: number) {
  // Friday check
  const isFriday = date.getDay() === 5;

  if (hMonth === 9 && hDay === 1) return { title: "১ রমজান (রোজা শুরু)", badge: "রমজান", color: "text-amber-400 bg-amber-400/10 border-amber-400/30" };
  if (hMonth === 9 && hDay === 17) return { title: "ঐতিহাসিক বদর দিবস", badge: "বদর", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" };
  if (hMonth === 9 && hDay === 27) return { title: "পবিত্র শবে কদর", badge: "কদর", color: "text-purple-400 bg-purple-400/10 border-purple-400/30" };
  if (hMonth === 10 && hDay === 1) return { title: "পবিত্র ঈদুল ফিতর", badge: "ঈদ", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" };
  if (hMonth === 12 && hDay === 9) return { title: "আরাফাত দিবস ও হজ", badge: "হজ", color: "text-amber-400 bg-amber-400/10 border-amber-400/30" };
  if (hMonth === 12 && hDay === 10) return { title: "পবিত্র ঈদুল আজহা (কোরবানি)", badge: "কোরবানি", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" };
  if (hMonth === 1 && hDay === 10) return { title: "পবিত্র আশুরা", badge: "আশুরা", color: "text-rose-400 bg-rose-400/10 border-rose-400/30" };
  if (hMonth === 3 && hDay === 12) return { title: "ঈদে মিলাদুন্নবী (সা.)", badge: "মিলাদ", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" };
  if (hMonth === 7 && hDay === 27) return { title: "পবিত্র শবে মেরাজ", badge: "মেরাজ", color: "text-sky-400 bg-sky-400/10 border-sky-400/30" };
  if (hMonth === 8 && hDay === 15) return { title: "পবিত্র শবে বরাত", badge: "শবে বরাত", color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/30" };
  if (isFriday) return { title: "পবিত্র জুমার দিন", badge: "জুমা", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" };

  return null;
}

function Analytics() {
  const t = useT();
  const { prayers, items, hijriOffset, setHijriOffset } = useApp();

  const todayStr = today();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Calendar View Month Navigation
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const jumpToday = () => {
    setViewDate(new Date());
    setSelectedDate(todayStr);
  };

  // Streak Calculation
  const streak = useMemo(() => {
    const todayComplete = prayers.every((p) => p.doneDates.includes(todayStr));
    let st = todayComplete ? 1 : 0;
    for (let i = 1; i <= 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = today(d);
      if (prayers.every((p) => p.doneDates.includes(dayKey))) {
        st++;
      } else {
        break;
      }
    }
    return st;
  }, [prayers, todayStr]);

  // Overall rates for last 30 days
  const stats30 = useMemo(() => {
    let totalPrayersDone = 0;
    let totalHabitsDone = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = today(d);
      totalPrayersDone += prayers.filter((p) => p.doneDates.includes(dayKey)).length;
      totalHabitsDone += items.filter((item) => item.doneDates.includes(dayKey)).length;
    }
    const prayerRate = Math.round((totalPrayersDone / (30 * 5)) * 100);
    const habitRate = items.length ? Math.round((totalHabitsDone / (30 * items.length)) * 100) : 0;
    return { prayerRate, habitRate };
  }, [prayers, items]);

  // Build calendar days for the current view month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday

    const days = [];
    // Leading days from previous month
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevDate = new Date(year, month, -startingDayOfWeek + i + 1);
      days.push({
        dateObj: prevDate,
        dateKey: today(prevDate),
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      days.push({
        dateObj,
        dateKey: today(dateObj),
        isCurrentMonth: true,
      });
    }

    // Trailing days to fill 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({
        dateObj: nextDate,
        dateKey: today(nextDate),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  // Selected Day Details
  const selectedDateObj = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selectedDate]);

  const selectedHijri = useMemo(() => {
    return getHijriInfo(selectedDateObj, hijriOffset);
  }, [selectedDateObj, hijriOffset]);

  const selectedEvent = useMemo(() => {
    return getIslamicEvent(selectedDateObj, selectedHijri.day, selectedHijri.month);
  }, [selectedDateObj, selectedHijri]);

  const selectedPrayers = useMemo(() => {
    return PRAYERS.map((k) => {
      const pr = prayers.find((p) => p.key === k);
      const isDone = pr ? pr.doneDates.includes(selectedDate) : false;
      return {
        key: k,
        name: t(k as never),
        time: pr?.time || "",
        done: isDone,
      };
    });
  }, [prayers, selectedDate, t]);

  const selectedItems = useMemo(() => {
    return items.map((i) => ({
      ...i,
      done: i.doneDates.includes(selectedDate),
    }));
  }, [items, selectedDate]);

  const prayersDoneCount = selectedPrayers.filter((p) => p.done).length;
  const itemsDoneCount = selectedItems.filter((i) => i.done).length;

  // Upcoming 5 major Islamic events from today onwards
  const upcomingEvents = useMemo(() => {
    const eventsList = [];
    const now = new Date();
    for (let i = 0; i <= 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const h = getHijriInfo(d, hijriOffset);
      const ev = getIslamicEvent(d, h.day, h.month);
      // Exclude generic weekly Friday from major events list
      if (ev && ev.badge !== "জুমা") {
        eventsList.push({
          dateStr: today(d),
          dateObj: d,
          title: ev.title,
          badge: ev.badge,
          hijriText: h.fullTextBn,
          daysLeft: i,
        });
        if (eventsList.length >= 6) break;
      }
    }
    return eventsList;
  }, [hijriOffset]);

  const monthNamesBn = [
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER & OVERALL STATS */}
      <header>
        <h1 className="text-3xl font-bold">{t("analytics")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          নামাজ, অভ্যাস এবং হিজরি ইসলামিক ক্যালেন্ডার
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass flex flex-col items-center justify-center p-3 text-center">
          <span className="text-2xl font-bold text-primary">{stats30.prayerRate}%</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{t("prayerRate")}</span>
        </div>
        <div className="glass flex flex-col items-center justify-center p-3 text-center">
          <span className="text-2xl font-bold text-success">{stats30.habitRate}%</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{t("habitRate")}</span>
        </div>
        <div className="glass flex flex-col items-center justify-center p-3 text-center">
          <div className="flex items-center gap-1">
            <Flame className="size-5 text-warning fill-warning" />
            <span className="text-2xl font-bold text-warning">{streak}</span>
          </div>
          <span className="mt-1 text-[11px] text-muted-foreground">{t("streak")} (দিন)</span>
        </div>
      </div>

      {/* ISLAMIC CALENDAR SECTION */}
      <section className="glass flex flex-col gap-4 p-4">
        {/* CALENDAR CONTROLS & HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/30 pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-5 text-primary" />
            <h2 className="text-lg font-bold">
              {monthNamesBn[month]} {year}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={jumpToday}
              className="rounded-xl bg-secondary px-2.5 py-1 text-xs font-semibold hover:bg-muted transition"
            >
              আজ
            </button>
            <button
              onClick={prevMonth}
              className="rounded-xl bg-muted p-1.5 hover:bg-muted/80 transition"
              title="পূর্ববর্তী মাস"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={nextMonth}
              className="rounded-xl bg-muted p-1.5 hover:bg-muted/80 transition"
              title="পরবর্তী মাস"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* LUNAR OFFSET / MOON SIGHTING ADJUSTMENT (চাঁদ দেখার তারিখ সমন্বয়) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <SlidersHorizontal className="size-3.5 text-primary" />
            <span>চাঁদ দেখার তারিখ সমন্বয় (Moon offset):</span>
          </div>
          <div className="flex items-center gap-1">
            {[-1, 0, 1].map((off) => (
              <button
                key={off}
                onClick={() => setHijriOffset(off)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-semibold transition",
                  hijriOffset === off ? "bg-primary text-primary-foreground shadow" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {off === 0 ? "০ (স্বাভাবিক)" : off > 0 ? `+${off} দিন` : `${off} দিন`}
              </button>
            ))}
          </div>
        </div>

        {/* WEEKDAYS HEADER */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">
          <span>রবি</span>
          <span>সোম</span>
          <span>মঙ্গল</span>
          <span>বুধ</span>
          <span>বৃহঃ</span>
          <span className="text-emerald-400 font-bold">শুক্র</span>
          <span>শনি</span>
        </div>

        {/* CALENDAR DAYS GRID */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            const h = getHijriInfo(cell.dateObj, hijriOffset);
            const ev = getIslamicEvent(cell.dateObj, h.day, h.month);

            const prayersDone = prayers.filter((p) => p.doneDates.includes(cell.dateKey)).length;
            const isToday = cell.dateKey === todayStr;
            const isSelected = cell.dateKey === selectedDate;
            const isPastOrToday = cell.dateKey <= todayStr;

            return (
              <div
                key={idx}
                onClick={() => setSelectedDate(cell.dateKey)}
                className={cn(
                  "group relative flex min-h-[4.2rem] flex-col items-center justify-between rounded-xl p-1 cursor-pointer transition select-none",
                  cell.isCurrentMonth ? "bg-card/40 hover:bg-card/80" : "opacity-30 hover:opacity-70",
                  isToday && "ring-1 ring-primary/80",
                  isSelected && "glow-on ring-2 ring-primary"
                )}
              >
                {/* Date numbers (Gregorian & Hijri) */}
                <div className="flex w-full items-center justify-between px-1">
                  <span className={cn("text-xs font-bold", isToday ? "text-primary font-extrabold" : "text-foreground")}>
                    {cell.dateObj.getDate()}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground/80">
                    {h.day}
                  </span>
                </div>

                {/* Event badge if present */}
                {ev && (
                  <span className={cn("rounded px-1 py-0.2 text-[8px] font-bold border truncate max-w-full leading-tight", ev.color)}>
                    {ev.badge}
                  </span>
                )}

                {/* Prayer dots / count indicator */}
                {isPastOrToday ? (
                  <div className="mt-1 flex items-center justify-center gap-0.5">
                    {prayersDone === 5 ? (
                      <span className="rounded bg-success/20 px-1 py-0.2 text-[9px] font-bold text-success">
                        ৫/৫
                      </span>
                    ) : prayersDone > 0 ? (
                      <span className="rounded bg-warning/20 px-1 py-0.2 text-[9px] font-semibold text-warning">
                        {prayersDone}/৫
                      </span>
                    ) : (
                      <span className="rounded bg-destructive/15 px-1 py-0.2 text-[9px] font-semibold text-destructive/80">
                        ০/৫
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/30">•</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SELECTED DAY DETAILED BREAKDOWN MODAL / PANEL */}
      <section className="glass flex flex-col gap-4 p-5 animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/30 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <h3 className="text-base font-bold text-foreground">
                {selectedDateObj.toLocaleDateString("bn-BD", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-primary font-medium">
              🌙 {selectedHijri.fullTextBn}
            </p>
          </div>

          {selectedEvent && (
            <span className={cn("inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-semibold", selectedEvent.color)}>
              <Sparkles className="size-3" />
              {selectedEvent.title}
            </span>
          )}
        </div>

        {/* 5 PRAYERS STATUS */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            নামাজের হিসাব ({prayersDoneCount}/৫ ওয়াক্ত আদায়)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {selectedPrayers.map((p) => (
              <div
                key={p.key}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-2.5 transition",
                  p.done
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border/40 bg-muted/30 text-muted-foreground"
                )}
              >
                <div>
                  <p className="text-xs font-bold text-foreground">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.time}</p>
                </div>
                {p.done ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <XCircle className="size-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* HABITS & TASKS STATUS */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            অভ্যাস ও টাস্ক ({itemsDoneCount}/{selectedItems.length} সম্পন্ন)
          </h4>
          {selectedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">কোনো টাস্ক বা অভ্যাস যুক্ত করা নেই।</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-2.5 text-xs transition",
                    item.done
                      ? "border-success/40 bg-success/10 text-success font-medium"
                      : "border-border/40 bg-muted/30 text-muted-foreground"
                  )}
                >
                  <span className="truncate pr-2">{item.title}</span>
                  {item.done ? (
                    <span className="flex items-center gap-1 text-[10px] text-success font-semibold shrink-0">
                      <CheckCircle2 className="size-3.5" /> সম্পন্ন
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">বাকি ছিল</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* UPCOMING ISLAMIC EVENTS (LIKE GOOGLE CALENDAR) */}
      <section className="glass flex flex-col gap-3 p-5">
        <h3 className="text-base font-bold flex items-center gap-2">
          <span>🕌</span>
          আসন্ন গুরুত্বপূর্ণ ইসলামিক দিন ও পর্বসমূহ
        </h3>
        <p className="text-xs text-muted-foreground">
          চাঁদ দেখার সমন্বয় অনুযায়ী স্বয়ংক্রিয়ভাবে তারিখ আপডেট হয়:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
          {upcomingEvents.map((ev, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border/40 bg-card/30 p-3 hover:bg-card/60 transition"
            >
              <div>
                <p className="text-xs font-bold text-foreground">{ev.title}</p>
                <p className="text-[10px] text-primary mt-0.5">{ev.hijriText}</p>
                <p className="text-[10px] text-muted-foreground">{ev.dateStr}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  {ev.daysLeft === 0 ? "আজ" : `${ev.daysLeft} দিন বাকি`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
