#!/usr/bin/env bun
import { ConfigError, loadConfig, validateConfig, type Config } from "../lib/config";
import {
  clearWorkspaceToken,
  listTabs,
  listWorkspaces,
  renameTab,
  setWorkspaceToken,
  type TabInfo,
  type WorkspaceInfo,
} from "../lib/herdr";
import { withLock } from "../lib/lock";
import { desiredTabLabel, desiredWorkspaceToken, tabBase } from "../lib/naming";

const TOKEN_NAME = "jumpnum";

/** 個別の変更失敗を集める。1 件の失敗で全体を止めない。 */
function applyAll(failures: string[], actions: (() => void)[]): void {
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      failures.push((error as Error).message);
    }
  }
}

function syncWorkspaces(
  cfg: Config,
  workspaces: WorkspaceInfo[],
  failures: string[],
): void {
  applyAll(
    failures,
    workspaces.map((workspace) => () => {
      const value = desiredWorkspaceToken(cfg, workspace.number);
      if (value === null) clearWorkspaceToken(workspace.workspace_id, TOKEN_NAME);
      else setWorkspaceToken(workspace.workspace_id, TOKEN_NAME, value);
    }),
  );
}

function syncTabs(cfg: Config, tabs: TabInfo[], failures: string[]): void {
  applyAll(
    failures,
    tabs.map((tab) => () => {
      const label = desiredTabLabel(cfg, tab.label, tab.number);
      if (label !== null) renameTab(tab.tab_id, label);
    }),
  );
}

function resetAll(
  cfg: Config,
  workspaces: WorkspaceInfo[],
  tabs: TabInfo[],
  failures: string[],
): void {
  // workspaces / tabs が false でも両方を後始末する。
  // 無効化した後に片付けられないと、表示が残ったまま消せなくなる。
  applyAll(
    failures,
    workspaces.map((workspace) => () => clearWorkspaceToken(workspace.workspace_id, TOKEN_NAME)),
  );
  applyAll(
    failures,
    tabs.map((tab) => () => {
      if (/^\d+$/.test(tab.label)) return; // herdr の既定ラベルには触らない
      const base = tabBase(cfg, tab.label);
      if (base !== null && base !== tab.label) renameTab(tab.tab_id, base);
    }),
  );
}

function main(): number {
  const reset = process.argv.includes("--reset");

  let cfg: Config;
  try {
    cfg = loadConfig();
    validateConfig(cfg);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`設定エラー: ${error.message}\n`);
      return 2;
    }
    throw error;
  }

  const failures: string[] = [];

  const outcome = withLock(() => {
    // 一覧の取得はロック取得「後」。待たされた実行が最新を読むことを保証する。
    // ここで失敗したら変更を一切適用せずに抜ける(fail-closed)。
    // 不完全な一覧で番号を振り直すと、実在する tab の prefix を誤って剥がしうる。
    const workspaces = reset || cfg.workspaces ? listWorkspaces() : [];
    const tabs = reset || cfg.tabs ? listTabs() : [];

    if (reset) {
      resetAll(cfg, workspaces, tabs, failures);
      return;
    }
    if (cfg.workspaces) syncWorkspaces(cfg, workspaces, failures);
    if (cfg.tabs) syncTabs(cfg, tabs, failures);
  });

  if (outcome === null) {
    // 先行する実行が最新状態で処理する。取りこぼしではないので成功扱い。
    return 0;
  }

  if (failures.length > 0) {
    process.stderr.write(`${failures.length} 件の適用に失敗した:\n`);
    for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
    return 1;
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
