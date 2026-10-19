import { isNative } from "./notify";

export const APP_VERSION = "1.0.0";

/** Where the app looks for updates. For the APK this must be the published site address. */
export const API_BASE: string = (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "";

export interface UpdateInfo {
  version: string;
  apkUrl: string;
  notes?: string;
}

const newer = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const r = await fetch(`${API_BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("update check failed");
  const info = (await r.json()) as UpdateInfo;
  return newer(info.version, APP_VERSION) ? info : null;
}

export async function openUpdate(info: UpdateInfo) {
  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: info.apkUrl });
  } else {
    window.open(info.apkUrl, "_blank");
  }
}
