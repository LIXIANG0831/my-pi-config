/**
 * custom-provider-ext — 通用自定义供应商扩展
 *
 * 只需修改下方「配置区」的常量即可适配任意服务。
 * 支持 OpenAI Completions 和 Anthropic Messages 两种协议。
 *
 * ── 两种模型获取策略 ──
 *   AUTO_DISCOVER_MODELS = true  → pi 自动在模型刷新时从 BASE_URL/v1/models 拉取
 *                                  （启动时、/login 完成后、/reload 时均会触发）
 *   AUTO_DISCOVER_MODELS = false → 使用 HARDCODED_MODELS 中预定义的模型
 */

import {
  createProvider,
  openAICompletionsApi,
  anthropicMessagesApi,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ProviderModelConfig,
  RefreshModelsContext,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "fs";
import { homedir } from "os";

// ════════════════════════════════════════════════════════════
// 🔧 配置区 — 修改以下常量以适配你的供应商
// ════════════════════════════════════════════════════════════

/** pi 内部的供应商 ID（用于 /login、/model、--model 等） */
const PROVIDER_ID = "cosmoplat";

/** 供应商显示名称 */
const PROVIDER_NAME = "⚡" + "COSMOPlat";

/** API 地址 */
const BASE_URL = "https://gpt.cosmoplat.com/v1";

/** 协议类型 */
type ApiChoice = "openai-completions" | "anthropic-messages";
const API_TYPE: ApiChoice = "anthropic-messages";

/** /login 时的输入提示 */
const AUTH_PROMPT = "请输入 API Key:";

// ════════════════════════════════════════════════════════════
// 📋 模型列表策略
// ════════════════════════════════════════════════════════════

/**
 * true  → 从 BASE_URL/v1/models 自动发现模型
 *         pi 会在启动加载缓存、/login 完成后自动调用 fetchModels 刷新
 * false → 使用下方 HARDCODED_MODELS
 */
const AUTO_DISCOVER_MODELS = false;

/** 手动指定模型（仅 AUTO_DISCOVER_MODELS = false 时生效） */
const HARDCODED_MODELS: ProviderModelConfig[] = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    reasoning: true,
    input: ["text"],
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    reasoning: true,
    input: ["text"],
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "minimax-m3",
    name: "MiniMax M3",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: "cosmo-mind-turbo-plus",
    name: "GLM 5.2",
    reasoning: true,
    input: ["text"],
    contextWindow: 1000000,
    maxTokens: 131072,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
];

// ════════════════════════════════════════════════════════════
// 🤖 模型自动发现 — 推断规则
// ════════════════════════════════════════════════════════════

/** 模型 ID 包含这些关键词 → 标记为 reasoning: true */
const REASONING_KEYWORDS = [
  "reasoning", "thinking", "think",
  "deepseek-r1", "o1", "o3",
];

/** 模型 ID 包含这些关键词 → 标记为支持图片输入 */
const VISION_KEYWORDS = [
  "vision", "vl", "multimodal",
  "gpt-4o", "gpt-4-turbo", "claude-3", "gemini",
];

const DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  tiers: [],
} as const;

// ════════════════════════════════════════════════════════════
// 实现
// ════════════════════════════════════════════════════════════

function getApi() {
  switch (API_TYPE) {
    case "openai-completions":
      return openAICompletionsApi();
    case "anthropic-messages":
      return anthropicMessagesApi();
  }
}

function getStoredApiKey(): string | undefined {
  try {
    const authPath = `${homedir()}/.pi/agent/auth.json`;
    const raw = readFileSync(authPath, "utf-8");
    const auth = JSON.parse(raw);
    return auth[PROVIDER_ID]?.key;
  } catch {
    return undefined;
  }
}

async function validateApiKey(key: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

interface RawModelEntry {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

function mapModels(raw: RawModelEntry[]): ProviderModelConfig[] {
  return raw
    .filter(
      (m): m is RawModelEntry & { id: string } =>
        typeof m.id === "string" && m.id.length > 0
    )
    .map((m) => {
      const idLower = m.id.toLowerCase();
      return {
        id: m.id,
        name: m.id,
        provider: PROVIDER_ID,
        baseUrl: BASE_URL,
        reasoning: REASONING_KEYWORDS.some((kw) => idLower.includes(kw)),
        input: (VISION_KEYWORDS.some((kw) => idLower.includes(kw))
          ? ["text", "image"]
          : ["text"]) as ["text"] | ["text", "image"],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: DEFAULT_COST,
      } as ProviderModelConfig;
    });
}

/** createProvider 的 fetchModels — pi 在刷新模型时自动调用 */
async function autoFetchModels(
  context: RefreshModelsContext
): Promise<ProviderModelConfig[]> {
  const apiKey = getStoredApiKey();
  if (!apiKey) return [];

  const response = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: context.signal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch /v1/models: ${response.status} ${response.statusText}`
    );
  }

  const payload = (await response.json()) as { data?: RawModelEntry[] };
  const raw = payload.data;
  if (!raw || raw.length === 0) {
    throw new Error("No models returned from /v1/models");
  }

  return mapModels(raw);
}

function ensureProvider(models: ProviderModelConfig[]): ProviderModelConfig[] {
  return models.map((m) => ({
    ...m,
    provider: PROVIDER_ID,
    baseUrl: BASE_URL,
    cost: m.cost ?? DEFAULT_COST,
  })) as ProviderModelConfig[];
}

// ════════════════════════════════════════════════════════════
// 入口
// ════════════════════════════════════════════════════════════

export default async function (pi: ExtensionAPI) {
  const models = AUTO_DISCOVER_MODELS
    ? []  // 自动发现模式：初始空列表，由 fetchModels 填充
    : ensureProvider(HARDCODED_MODELS);

  pi.registerProvider(
    createProvider({
      id: PROVIDER_ID,
      name: PROVIDER_NAME,
      baseUrl: BASE_URL,
      models,
      // 自动发现模式下，pi 会在启动、/login 完成后、/reload 时调用此函数
      fetchModels: AUTO_DISCOVER_MODELS ? autoFetchModels : undefined,
      api: getApi(),
      auth: {
        apiKey: {
          async login(interaction) {
            const key = await interaction.prompt({
              type: "secret",
              message: AUTH_PROMPT,
            });
            if (!key) throw new Error("已取消");

            const valid = await validateApiKey(key);
            if (!valid) {
              throw new Error(
                `API Key 校验失败，请确认 Key 正确后重新执行 /login ${PROVIDER_ID}`
              );
            }

            return { type: "api_key", key };
          },
          async resolve({ credential }) {
            return credential?.key
              ? {
                  auth: { apiKey: credential.key },
                  source: "已存储的 API Key",
                }
              : undefined;
          },
        },
      },
    })
  );
}
