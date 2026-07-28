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
    expect(subscribed.has("workspace.closed")).toBe(true);
  });

  test("tab のライフサイクルイベントを購読する", () => {
    expect(subscribed.has("tab.created")).toBe(true);
    expect(subscribed.has("tab.moved")).toBe(true);
    expect(subscribed.has("tab.closed")).toBe(true);
    expect(subscribed.has("tab.renamed")).toBe(true);
  });

  test("workspace.metadata_updated を購読しない", () => {
    // 自分の report-metadata がこのイベントを発火するため、購読すると無限ループになる。
    expect(subscribed.has("workspace.metadata_updated")).toBe(false);
  });

  test("reset action は --reset を渡す", () => {
    const reset = manifest.actions.find((action) => action.id === "reset");
    expect(reset?.command).toEqual(["bun", "bin/renumber.ts", "--reset"]);
  });

  test("platforms と min_herdr_version が固定されている", () => {
    expect(manifest.platforms).toEqual(["linux", "macos"]);
    expect(manifest.min_herdr_version).toBe("0.7.5");
  });
});
