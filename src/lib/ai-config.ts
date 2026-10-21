/**
 * Noor Habit - Multi-Provider AI Central Configuration & Intelligent Failover
 * Reads from environment variables, localStorage, and pre-configured reliable backups.
 */

declare global {
  interface ImportMetaEnv {
    readonly VITE_AI_BASE_URL?: string;
    readonly VITE_AI_API_KEY?: string;
    readonly VITE_AI_MODEL?: string;
    readonly VITE_AI_BACKUP_URL_1?: string;
    readonly VITE_AI_BACKUP_KEY_1?: string;
    readonly VITE_AI_BACKUP_MODEL_1?: string;
    readonly VITE_AI_BACKUP_URL_2?: string;
    readonly VITE_AI_BACKUP_KEY_2?: string;
    readonly VITE_AI_BACKUP_MODEL_2?: string;
    readonly VITE_BACKUP_AI_KEYS?: string;
    readonly VITE_VYCEAI_BASE_URL?: string;
    readonly VITE_VYCEAI_API_KEY?: string;
    readonly VYCEAI_BASE_URL?: string;
    readonly VYCEAI_API_KEY?: string;
    readonly AI_MODEL?: string;
    readonly VITE_API_BASE?: string;
  }
}

export interface AiProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Returns the prioritized list of AI provider endpoints and keys for automatic failover */
export function getAiProviders(): AiProviderConfig[] {
  const env = import.meta.env;
  const providers: AiProviderConfig[] = [];

  // 1. PRIMARY PROVIDER (User's preferred GLM / Custom key)
  const primaryUrl = (
    env.VITE_AI_BASE_URL ||
    env.VITE_VYCEAI_BASE_URL ||
    "https://api.xkiro.com/v1"
  ).replace(/\/+$/, "");

  const primaryKey = (
    env.VITE_AI_API_KEY ||
    env.VITE_VYCEAI_API_KEY ||
    "sk-8c5c0bc6d8871536b2f2bec1d549f8382e901c65d369e5d3"
  ).trim();

  const primaryModel = (
    env.VITE_AI_MODEL ||
    "glm-5.3-flash"
  ).trim();

  if (primaryKey) {
    providers.push({
      name: "Primary (GLM-5.3-flash)",
      baseUrl: primaryUrl,
      apiKey: primaryKey,
      model: primaryModel,
    });
  }

  // 2. BACKUP PROVIDER 1
  const backupKey1 = (
    env.VITE_AI_BACKUP_KEY_1 ||
    "sk-xt-6a8525d56dabe491d3ad69c565aae9c96497dc7e38951dbf"
  ).trim();
  const backupUrl1 = (env.VITE_AI_BACKUP_URL_1 || "https://api.xkiro.com/v1").replace(/\/+$/, "");
  const backupModel1 = (env.VITE_AI_BACKUP_MODEL_1 || "qwen/qwen3.8-max:free").trim();

  if (backupKey1 && backupKey1 !== primaryKey) {
    providers.push({
      name: "Backup 1 (Qwen3.8-Max)",
      baseUrl: backupUrl1,
      apiKey: backupKey1,
      model: backupModel1,
    });
  }

  // 3. BACKUP PROVIDER 2 (Additional key or comma-separated list from env)
  if (env.VITE_AI_BACKUP_KEY_2) {
    providers.push({
      name: "Backup 2",
      baseUrl: (env.VITE_AI_BACKUP_URL_2 || "https://api.xkiro.com/v1").replace(/\/+$/, ""),
      apiKey: env.VITE_AI_BACKUP_KEY_2.trim(),
      model: (env.VITE_AI_BACKUP_MODEL_2 || "glm-5.3-flash").trim(),
    });
  }

  if (env.VITE_BACKUP_AI_KEYS) {
    const extraKeys = env.VITE_BACKUP_AI_KEYS.split(",").map((k) => k.trim()).filter(Boolean);
    extraKeys.forEach((key, idx) => {
      if (!providers.some((p) => p.apiKey === key)) {
        providers.push({
          name: `Env Backup ${idx + 1}`,
          baseUrl: primaryUrl,
          apiKey: key,
          model: primaryModel,
        });
      }
    });
  }

  return providers;
}

export function getAiConfig() {
  const providers = getAiProviders();
  return providers[0] || {
    name: "Default",
    baseUrl: "https://api.xkiro.com/v1",
    apiKey: "sk-8c5c0bc6d8871536b2f2bec1d549f8382e901c65d369e5d3",
    model: "glm-5.3-flash",
  };
}
