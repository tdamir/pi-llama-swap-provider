/**
 * Llama Swap Provider Extension
 *
 * Registers llama-swap as an OpenAI-compatible provider.
 * Dynamically discovers models from the llama-swap API at startup.
 *
 * Server URL is configured in settings.json under `llamaSwap.baseUrl`.
 *
 * Usage:
 *   pi -e ./llama-swap-provider
 *
 * Or place in ~/.pi/agent/extensions/ for auto-discovery (hot-reloads on /reload).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_BASE_URL = "http://localhost:9292/v1";

function resolveBaseUrl(): string {
  try {
    const agentDir = getAgentDir();
    const settingsPath = join(agentDir, "settings.json");
    if (!existsSync(settingsPath)) return DEFAULT_BASE_URL;

    const raw = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const url = raw.llamaSwap?.baseUrl as string | undefined;
    if (url) {
      // Normalize: ensure trailing /v1
      const base = url.replace(/\/+$/, "");
      return base.endsWith("/v1") ? base : `${base}/v1`;
    }
  } catch {
    // ignore
  }
  return DEFAULT_BASE_URL;
}

function readSettings(): Record<string, unknown> {
  const agentDir = getAgentDir();
  const settingsPath = join(agentDir, "settings.json");
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, "utf-8"));
}

function writeSettings(raw: Record<string, unknown>) {
  const agentDir = getAgentDir();
  const settingsPath = join(agentDir, "settings.json");
  writeFileSync(settingsPath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
}

function normalizeUrl(url: string): string {
  const base = url.replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

function setLlamaSwapUrl(url: string) {
  const raw = readSettings();
  const normalized = normalizeUrl(url);
  raw.llamaSwap = { baseUrl: normalized };
  writeSettings(raw);
  return normalized;
}

// =============================================================================
// Model Discovery
// =============================================================================

/** Infer reasoning support from the model ID. */
function inferReasoning(id: string): boolean {
  return /-think|\.think|_think|Think/i.test(id);
}

/** Infer input types from the model's capabilities and architecture. */
function inferInputTypes(
  capabilities: { vision?: boolean } | undefined,
  architecture: { input_modalities?: string[] } | undefined,
): ("text" | "image")[] {
  if (capabilities?.vision) return ["text", "image"];
  const mods = architecture?.input_modalities ?? [];
  if (mods.some((m) => m.includes("image"))) return ["text", "image"];
  return ["text"];
}

/** Map a llama-swap model entry to a pi ProviderModelConfig. */
function mapModel(
  entry: {
    id: string;
    name?: string;
    context_length?: number;
    capabilities?: Record<string, unknown>;
    architecture?: {
      input_modalities?: string[];
      modality?: string;
    };
  },
): {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
} {
  const capabilities = entry.capabilities as { vision?: boolean } | undefined;
  const architecture = entry.architecture;

  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    reasoning: inferReasoning(entry.id),
    input: inferInputTypes(capabilities, architecture),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.context_length ?? 128000,
    maxTokens: entry.context_length ?? 128000,
  };
}

// =============================================================================
// Command: /llama-swap-url
// =============================================================================

function registerSetUrlCommand(pi: ExtensionAPI) {
  pi.registerCommand("llama-swap-url", {
    description: "Set the llama-swap provider base URL",
    handler: async (_args, ctx) => {
      const current = resolveBaseUrl();
      const prompt = `Current: ${current}\nEnter new base URL (without /v1, e.g. http://localhost:8080):`;

      const input = await ctx.ui.input(prompt);
      if (!input) {
        ctx.ui.notify("URL unchanged.", "info");
        return;
      }

      const normalized = setLlamaSwapUrl(input);
      ctx.ui.notify(`llama-swap URL set to: ${normalized}`, "info");
      ctx.ui.notify("Run /reload to apply the new URL.", "info");
    },
  });
}

// =============================================================================
// Extension Entry Point (async factory for dynamic model discovery)
// =============================================================================

export default async function (pi: ExtensionAPI) {
  registerSetUrlCommand(pi);

  const BASE_URL = resolveBaseUrl();

  try {
    const response = await fetch(`${BASE_URL}/models`);
    if (!response.ok) {
      throw new Error(`llama-swap API returned ${response.status}: ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data: Array<{
        id: string;
        name?: string;
        object?: string;
        created?: number;
        owned_by?: string;
        capabilities?: Record<string, unknown>;
        architecture?: {
          input_modalities?: string[];
          modality?: string;
        };
        context_length?: number;
      }>;
      object?: string;
    };

    const models = payload.data.map(mapModel);

    pi.registerProvider("llama-swap", {
      baseUrl: BASE_URL,
      apiKey: "none", // llama-swap is a local service, no auth needed
      api: "openai-completions",
      models,
    });
  } catch (error) {
    console.error(
      `[llama-swap] Failed to discover models from ${BASE_URL}/models:`,
      error instanceof Error ? error.message : String(error),
    );
    console.error("[llama-swap] Provider will not be available. Is llama-swap running?");
  }
}
