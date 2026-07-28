import { describe, expect, test } from "bun:test";
import { DEFAULTS, type Config } from "../lib/config";
import {
  desiredTabLabel,
  desiredWorkspaceToken,
  escapeRegExp,
  tabBase,
  tabPrefixPattern,
} from "../lib/naming";

const cfg = DEFAULTS;
const bracket: Config = { ...DEFAULTS, tabPrefix: "[{n}] " };
const dotted: Config = { ...DEFAULTS, tabPrefix: "{n}." };

describe("desiredTabLabel (既定書式 {n}:)", () => {
  test("既定ラベル(全桁数字)を壊さない", () => {
    // herdr の既定 tab ラベルは tab 番号そのもの。既に番号が出ているので触る必要がない。
    expect(desiredTabLabel(cfg, "1", 1)).toBeNull();
    expect(desiredTabLabel(cfg, "12", 12)).toBeNull();
  });

  test("ユーザー命名に番号を付与する", () => {
    expect(desiredTabLabel(cfg, "review", 3)).toBe("3:review");
  });

  test("既に正しい番号なら触らない(冪等)", () => {
    // tab.renamed を購読しているので、ここが null を返さないと無限ループする。
    expect(desiredTabLabel(cfg, "3:review", 3)).toBeNull();
  });

  test("位置変更に追随する", () => {
    expect(desiredTabLabel(cfg, "1:review", 3)).toBe("3:review");
  });

  test("多重 prefix を正規化する", () => {
    // 単発 replace の実装だとここで "2:" しか剥がれず落ちる。
    expect(desiredTabLabel(cfg, "2:3:review", 3)).toBe("3:review");
    expect(desiredTabLabel(cfg, "1:2:3:review", 4)).toBe("4:review");
  });

  test("max_number を超えたら番号を出さない", () => {
    expect(desiredTabLabel(cfg, "review", 12)).toBeNull();
  });

  test("max_number を超えたら既存の prefix を剥がす", () => {
    expect(desiredTabLabel(cfg, "3:review", 12)).toBe("review");
  });

  test("prefix だけのラベルには触らない", () => {
    // 剥がすと空ラベルになるため、番号が違っていても放置する方が安全。
    expect(desiredTabLabel(cfg, "3:", 3)).toBeNull();
    expect(desiredTabLabel(cfg, "2:", 3)).toBeNull();
  });

  test("空ラベルには触らない", () => {
    expect(desiredTabLabel(cfg, "", 1)).toBeNull();
  });

  test("予約領域の不変条件を破る入力の挙動を固定する", () => {
    // design.md 4.3 節。これは望ましい挙動ではなく、状態を持たない設計の代償。
    // 意図せず変わったら検知したいので、あえてテストで固定する。
    expect(desiredTabLabel(cfg, "1:30 standup", 3)).toBe("3:30 standup");
  });
});

describe("desiredTabLabel (別書式)", () => {
  test("[{n}] 書式でも付与・冪等・剥がしが成立する", () => {
    expect(desiredTabLabel(bracket, "review", 3)).toBe("[3] review");
    expect(desiredTabLabel(bracket, "[3] review", 3)).toBeNull();
    expect(desiredTabLabel(bracket, "[1] review", 3)).toBe("[3] review");
    expect(desiredTabLabel(bracket, "[3] review", 12)).toBe("review");
  });

  test("[{n}] 書式でも多重 prefix を剥がす", () => {
    expect(desiredTabLabel(bracket, "[2] [3] review", 4)).toBe("[4] review");
  });

  test("書式のリテラル部分が正規表現エスケープされる", () => {
    // "{n}." の "." が任意 1 文字にマッチしてはいけない。
    // "3xreview" は prefix を持たないので、まるごと base として扱われる。
    expect(desiredTabLabel(dotted, "3xreview", 3)).toBe("3.3xreview");
    expect(desiredTabLabel(dotted, "3.review", 3)).toBeNull();
  });
});

describe("desiredWorkspaceToken", () => {
  test("max_number 以内は書式を適用した値を返す", () => {
    expect(desiredWorkspaceToken(cfg, 1)).toBe("[1]");
    expect(desiredWorkspaceToken(cfg, 9)).toBe("[9]");
  });

  test("max_number 超過は null(トークンを消す)", () => {
    expect(desiredWorkspaceToken(cfg, 10)).toBeNull();
  });

  test("max_number を絞ると範囲が変わる", () => {
    const narrow: Config = { ...DEFAULTS, maxNumber: 3 };
    expect(desiredWorkspaceToken(narrow, 3)).toBe("[3]");
    expect(desiredWorkspaceToken(narrow, 4)).toBeNull();
  });
});

describe("tabPrefixPattern / tabBase / escapeRegExp", () => {
  test("既定書式から /^\\d+:/ を導出する", () => {
    expect(tabPrefixPattern(cfg).source).toBe("^\\d+:");
  });

  test("tabBase は prefix だけのラベルに null を返す", () => {
    expect(tabBase(cfg, "3:")).toBeNull();
    expect(tabBase(cfg, "")).toBeNull();
    expect(tabBase(cfg, "2:3:review")).toBe("review");
  });

  test("escapeRegExp が正規表現メタ文字を無害化する", () => {
    expect(new RegExp(escapeRegExp("a.b")).test("axb")).toBe(false);
    expect(new RegExp(escapeRegExp("a.b")).test("a.b")).toBe(true);
  });
});
