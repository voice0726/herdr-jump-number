import { describe, expect, test } from "bun:test";
import { listTabs, listWorkspaces, run } from "../lib/herdr";

function withEmptyHerdr<T>(callback: () => T): T {
  const previous = process.env.HERDR_BIN_PATH;
  // true は引数を無視して exit 0・空 stdout を返すため、herdr の空成功応答を単体で再現する。
  process.env.HERDR_BIN_PATH = "true";
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.HERDR_BIN_PATH;
    else process.env.HERDR_BIN_PATH = previous;
  }
}

describe("lib/herdr.ts", () => {
  test("exit 0 かつ空 stdout の応答を成功として空オブジェクトを返す", () => {
    const result = withEmptyHerdr(() =>
      run([
        "workspace",
        "report-metadata",
        "w2J",
        "--source",
        "diag",
        "--token",
        "diag=x",
      ]),
    );

    expect(result).toEqual({});
  });

  test("workspace list が空 stdout ならエラーにする", () => {
    expect(() => withEmptyHerdr(() => listWorkspaces())).toThrow(
      "workspaces 配列が無い",
    );
  });

  test("tab list が空 stdout ならエラーにする", () => {
    expect(() => withEmptyHerdr(() => listTabs())).toThrow("tabs 配列が無い");
  });
});
