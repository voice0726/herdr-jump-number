import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = Bun.TOML.parse(
  readFileSync(join(import.meta.dir, "..", "herdr-plugin.toml"), "utf8"),
) as {
  id: string;
  platforms: string[];
  min_herdr_version: string;
  events: { on: string; command: string[] }[];
  actions: { id: string; command: string[] }[];
};

const subscribed = new Set(manifest.events.map((event) => event.on));

describe("herdr-plugin.toml", () => {
  test("plugin id は --source の値と一致する", () => {
    expect(manifest.id).toBe("voice0726.jump-number");
  });

  test("workspace のライフサイクルイベントを購読する", () => {
    // 取りこぼすと番号がズレたまま更新されない。宣言自体を固定する。
    expect(subscribed.has("workspace.created")).toBe(true);
    expect(subscribed.has("workspace.moved")).toBe(true);
    // UI からの並び替えは moved ではなく reordered が発火する。
    expect(subscribed.has("workspace.reordered")).toBe(true);
    expect(subscribed.has("workspace.closed")).toBe(true);
  });

  test("tab のライフサイクルイベントを購読する", () => {
    expect(subscribed.has("tab.created")).toBe(true);
    expect(subscribed.has("tab.moved")).toBe(true);
    expect(subscribed.has("tab.closed")).toBe(true);
    expect(subscribed.has("tab.renamed")).toBe(true);
  });

  test("workspace / tab イベントを伴わない消滅も購読する", () => {
    // herdr 0.8.2 実測: worktree remove は worktree.removed だけ、
    // shell の exit は pane.exited だけ、tab 最後の pane の close は pane.closed だけを発火する。
    // これらを落とすと workspace / tab が消えても番号が振り直されない。
    expect(subscribed.has("worktree.removed")).toBe(true);
    expect(subscribed.has("pane.exited")).toBe(true);
    expect(subscribed.has("pane.closed")).toBe(true);
  });

  test("workspace.metadata_updated を購読しない", () => {
    // 自分の report-metadata がこのイベントを発火するため、購読すると無限ループになる。
    expect(subscribed.has("workspace.metadata_updated")).toBe(false);
  });

  test("有効中に再同期で打ち消される reset action を公開しない", () => {
    const reset = manifest.actions.find((action) => action.id === "reset");
    expect(reset).toBeUndefined();
  });

  test("platforms と min_herdr_version が固定されている", () => {
    expect(manifest.platforms).toEqual(["linux", "macos"]);
    expect(manifest.min_herdr_version).toBe("0.8.2");
  });
});
