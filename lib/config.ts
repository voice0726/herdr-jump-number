import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PLACEHOLDER = "{n}";

export type Config = {
  workspaces: boolean;
  tabs: boolean;
  workspaceToken: string;
  tabPrefix: string;
  maxNumber: number;
};

export const DEFAULTS: Config = {
  workspaces: true,
  tabs: true,
  workspaceToken: "[{n}]",
  tabPrefix: "{n}:",
  maxNumber: 9,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function countPlaceholder(value: string): number {
  return value.split(PLACEHOLDER).length - 1;
}

function requireExactlyOnePlaceholder(key: string, value: string): void {
  if (typeof value !== "string") {
    throw new ConfigError(`${key} は文字列である必要がある`);
  }
  const count = countPlaceholder(value);
  if (count !== 1) {
    throw new ConfigError(
      `${key} は ${PLACEHOLDER} をちょうど 1 個含む必要がある (実際: ${count} 個, 値: ${JSON.stringify(value)})`,
    );
  }
}

export function validateConfig(cfg: Config): void {
  for (const key of ["workspaces", "tabs"] as const) {
    if (typeof cfg[key] !== "boolean") {
      throw new ConfigError(`${key} は真偽値である必要がある`);
    }
  }
  requireExactlyOnePlaceholder("tab_prefix", cfg.tabPrefix);
  requireExactlyOnePlaceholder("workspace_token", cfg.workspaceToken);
  if (
    !Number.isInteger(cfg.maxNumber) ||
    cfg.maxNumber < 1 ||
    cfg.maxNumber > 9
  ) {
    throw new ConfigError(
      `max_number は 1 以上 9 以下の整数である必要がある (実際: ${cfg.maxNumber})`,
    );
  }
}

export function loadConfig(dir = process.env.HERDR_PLUGIN_CONFIG_DIR): Config {
  if (!dir) return { ...DEFAULTS };
  const path = join(dir, "config.toml");
  if (!existsSync(path)) return { ...DEFAULTS };

  let raw: Record<string, unknown>;
  try {
    raw = Bun.TOML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError(
      `${path} を TOML として解析できない: ${(error as Error).message}`,
    );
  }

  return {
    workspaces: (raw.workspaces ?? DEFAULTS.workspaces) as boolean,
    tabs: (raw.tabs ?? DEFAULTS.tabs) as boolean,
    workspaceToken: (raw.workspace_token ?? DEFAULTS.workspaceToken) as string,
    tabPrefix: (raw.tab_prefix ?? DEFAULTS.tabPrefix) as string,
    maxNumber: (raw.max_number ?? DEFAULTS.maxNumber) as number,
  };
}
