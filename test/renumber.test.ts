import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "..", "bin", "renumber.ts");
const FAKE = join(import.meta.dir, "fixtures", "fake-herdr.ts");

type RunResult = { exitCode: number; calls: string[][]; stderr: string };

function runPlugin(options: {
  workspaces?: unknown[];
  tabs?: unknown[];
  configToml?: string;
  fail?: string;
  args?: string[];
}): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "jumpnum-run-"));
  const logPath = join(dir, "calls.log");
  if (options.configToml !== undefined) {
    // Bun.write は Promise を返すので使わない。子プロセス起動前に確実に書き込む必要がある。
    writeFileSync(join(dir, "config.toml"), options.configToml);
  }

  const proc = Bun.spawnSync(["bun", ENTRY, ...(options.args ?? [])], {
    env: {
      ...process.env,
      // 偽 herdr を bun 経由で起動する。shebang と実行権に依存しない。
      HERDR_BIN_PATH: join(import.meta.dir, "fixtures", "fake-herdr-shim.sh"),
      FAKE_HERDR_BIN: FAKE,
      FAKE_HERDR_LOG: logPath,
      FAKE_HERDR_WORKSPACES: JSON.stringify(options.workspaces ?? []),
      FAKE_HERDR_TABS: JSON.stringify(options.tabs ?? []),
      FAKE_HERDR_FAIL: options.fail ?? "",
      HERDR_PLUGIN_CONFIG_DIR: dir,
      HERDR_PLUGIN_STATE_DIR: dir,
    },
  });

  const calls = existsSync(logPath)
    ? readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[])
    : [];

  return { exitCode: proc.exitCode, calls, stderr: proc.stderr.toString() };
}

const WS = [
  { workspace_id: "w1", number: 1, label: "~" },
  { workspace_id: "w2", number: 10, label: "proj" },
];
const TABS = [
  { tab_id: "w1:t1", workspace_id: "w1", number: 1, label: "1" },
  { tab_id: "w1:t2", workspace_id: "w1", number: 2, label: "review" },
  { tab_id: "w2:t1", workspace_id: "w2", number: 1, label: "notes" },
];

describe("bin/renumber.ts", () => {
  test("workspace rename を一度も発行しない", () => {
    // これがプラグインの存在理由。退行したら即座に落ちる必要がある。
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const renames = calls.filter((call) => call[0] === "workspace" && call[1] === "rename");
    expect(renames).toEqual([]);
  });

  test("トークン名は jumpnum である", () => {
    // --source はトークンを名前空間分離しないため、汎用名 num は他プラグインと衝突する。
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const tokenCall = calls.find((call) => call.includes("--token"));
    expect(tokenCall?.[tokenCall.indexOf("--token") + 1]).toBe("jumpnum=[1]");
  });

  test("max_number 超過の workspace には --clear-token を発行する", () => {
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const clear = calls.find((call) => call.includes("--clear-token"));
    expect(clear).toBeDefined();
    expect(clear?.[2]).toBe("w2");
    expect(clear?.[clear.indexOf("--clear-token") + 1]).toBe("jumpnum");
  });

  test("既定ラベルの tab には rename を発行しない", () => {
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const renamed = calls
      .filter((call) => call[0] === "tab" && call[1] === "rename")
      .map((call) => call[2]);
    expect(renamed).not.toContain("w1:t1");
  });

  test("複数 workspace にまたがる tab を 1 回で処理する", () => {
    // tab list は全 workspace を返すので、cross-workspace move の両側が更新される。
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const renamed = calls.filter((call) => call[0] === "tab" && call[1] === "rename");
    expect(renamed).toContainEqual(["tab", "rename", "w1:t2", "2:review"]);
    expect(renamed).toContainEqual(["tab", "rename", "w2:t1", "1:notes"]);
  });

  test("tabs = false のとき tab rename を一切発行しない", () => {
    const { calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      configToml: "tabs = false\n",
    });
    expect(calls.filter((call) => call[0] === "tab" && call[1] === "rename")).toEqual([]);
  });

  test("workspaces = false のとき report-metadata を発行しない", () => {
    const { calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      configToml: "workspaces = false\n",
    });
    expect(calls.filter((call) => call[1] === "report-metadata")).toEqual([]);
  });

  test("--reset は無効化されていても両方を後始末する", () => {
    const resetTabs = [
      { tab_id: "w1:t1", workspace_id: "w1", number: 1, label: "1" },
      { tab_id: "w1:t2", workspace_id: "w1", number: 2, label: "2:review" },
    ];
    const { calls } = runPlugin({
      workspaces: WS,
      tabs: resetTabs,
      configToml: "workspaces = false\ntabs = false\n",
      args: ["--reset"],
    });
    expect(calls.filter((call) => call.includes("--clear-token")).length).toBe(2);
    // "1" は既定ラベルなので触らない。prefix を持つ tab だけ剥がす。
    expect(calls).toContainEqual(["tab", "rename", "w1:t2", "review"]);
  });

  test("設定が不正なら何も発行せず非 0 終了する", () => {
    const { exitCode, calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      configToml: 'tab_prefix = ":"\n',
    });
    expect(exitCode).not.toBe(0);
    expect(calls).toEqual([]);
  });

  test("workspace list 失敗時は変更系を発行せず非 0 終了する", () => {
    const { exitCode, calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      fail: "workspace list",
    });
    expect(exitCode).not.toBe(0);
    expect(calls.filter((call) => call[1] === "rename" || call[1] === "report-metadata")).toEqual(
      [],
    );
  });

  test("tab list 失敗時も変更系を発行せず非 0 終了する", () => {
    // 片方だけの検証で満足しない。
    const { exitCode, calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      fail: "tab list",
    });
    expect(exitCode).not.toBe(0);
    expect(calls.filter((call) => call[1] === "rename" || call[1] === "report-metadata")).toEqual(
      [],
    );
  });

  test("個別の tab rename が失敗しても残りを処理し、最後に非 0 終了する", () => {
    const { exitCode, calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      fail: "tab rename w1:t2 2:review",
    });
    expect(exitCode).not.toBe(0);
    expect(calls).toContainEqual(["tab", "rename", "w2:t1", "1:notes"]);
  });

  test("すべて成功したら 0 終了する", () => {
    const { exitCode } = runPlugin({ workspaces: WS, tabs: TABS });
    expect(exitCode).toBe(0);
  });
});
