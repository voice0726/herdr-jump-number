import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, DEFAULTS, loadConfig, validateConfig } from "../lib/config";

function dirWith(toml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "jumpnum-cfg-"));
  writeFileSync(join(dir, "config.toml"), toml);
  return dir;
}

describe("loadConfig", () => {
  test("config.toml が無いとき既定値になる", () => {
    const dir = mkdtempSync(join(tmpdir(), "jumpnum-empty-"));
    expect(loadConfig(dir)).toEqual(DEFAULTS);
  });

  test("一部のキーだけ書いたとき、残りが既定値で埋まる", () => {
    const cfg = loadConfig(dirWith("tabs = false\nmax_number = 5\n"));
    expect(cfg.tabs).toBe(false);
    expect(cfg.maxNumber).toBe(5);
    expect(cfg.workspaces).toBe(DEFAULTS.workspaces);
    expect(cfg.workspaceToken).toBe(DEFAULTS.workspaceToken);
    expect(cfg.tabPrefix).toBe(DEFAULTS.tabPrefix);
  });

  test("snake_case のキーが camelCase に写る", () => {
    const cfg = loadConfig(dirWith('workspace_token = "<{n}>"\ntab_prefix = "{n})"\n'));
    expect(cfg.workspaceToken).toBe("<{n}>");
    expect(cfg.tabPrefix).toBe("{n})");
  });
});

describe("validateConfig", () => {
  test("既定値は妥当", () => {
    expect(() => validateConfig(DEFAULTS)).not.toThrow();
  });

  test("tab_prefix に {n} が無いと落ちる", () => {
    // これを通すと prefix を特定できず、実行のたびにラベルが伸び続ける。
    // 最も壊れ方が悪い入力なので単独のケースとして持つ。
    expect(() => validateConfig({ ...DEFAULTS, tabPrefix: ":" })).toThrow(ConfigError);
  });

  test("workspace_token に {n} が無いと落ちる", () => {
    // 全 workspace が同じ固定値になり、番号表示という目的自体が壊れる。
    expect(() => validateConfig({ ...DEFAULTS, workspaceToken: "[x]" })).toThrow(ConfigError);
  });

  test("{n} が 2 個以上あると落ちる", () => {
    expect(() => validateConfig({ ...DEFAULTS, tabPrefix: "{n}{n}:" })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, workspaceToken: "[{n}{n}]" })).toThrow(ConfigError);
  });

  test("空文字は落ちる", () => {
    expect(() => validateConfig({ ...DEFAULTS, tabPrefix: "" })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, workspaceToken: "" })).toThrow(ConfigError);
  });

  test("max_number は 1..9 の整数のみ", () => {
    // herdr の jump key が 1..9 のため。範囲外は設定ミスとして扱う。
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: 0 })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: 10 })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: -1 })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: 3.5 })).toThrow(ConfigError);
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: 1 })).not.toThrow();
    expect(() => validateConfig({ ...DEFAULTS, maxNumber: 9 })).not.toThrow();
  });

  test("workspaces / tabs が真偽値でないと落ちる", () => {
    expect(() =>
      validateConfig({ ...DEFAULTS, tabs: "yes" as unknown as boolean }),
    ).toThrow(ConfigError);
  });
});
