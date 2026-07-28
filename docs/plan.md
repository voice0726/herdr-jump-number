# herdr-jump-number 実装計画

> **For agentic workers:** この計画は 1 タスクずつ実装する。各ステップはチェックボックス (`- [ ]`) で追跡する。設計の根拠は `docs/design.md` にある。**実装前に design.md を読むこと。**

**Goal:** herdr の jump key (`prefix+1..9` = tab、`prefix+shift+1..9` = workspace) に対応する番号を、workspace ラベルを rename せずに表示する herdr プラグインを作る。

**Architecture:** workspace は `report-metadata` の表示専用トークン (`$jumpnum`) で番号を出し、label に触れないので herdr の cwd 自動命名が生き続ける。tab は `report-metadata` が無いため label に `3:review` 形式の prefix を埋め込むが、tab ラベルは自動命名を持たないので副作用が無い。永続状態は持たず、prefix の有無だけで所有権判定を閉じる。

**Tech Stack:** bun 1.3+ / TypeScript。ビルド工程なし。外部依存ゼロ（TOML は `Bun.TOML.parse`、プロセス起動は `Bun.spawnSync`）。テストは `bun test`。

## Global Constraints

- plugin id: `voice0726.jump-number`（`herdr-plugin.toml` の `id`、`--source` の値、この 2 箇所で完全一致させる）
- `platforms = ["linux", "macos"]`
- `min_herdr_version = "0.7.5"`
- workspace のトークン名は **`jumpnum`**。`num` にしてはいけない（`--source` はトークンを名前空間分離しないことが検証済み。design.md 3 節）
- **`herdr workspace rename` を絶対に発行しない。** これがプラグインの存在理由（design.md 1 節）
- **`workspace.metadata_updated` を購読しない。** 自分の `report-metadata` で無限ループする
- 外部 npm 依存を追加しない。必要な機能はすべて bun 組み込みで足りることを確認済み
- ドキュメント（README / コメント）は日本語。コード識別子は英語
- 環境変数はすべて herdr が渡す: `HERDR_BIN_PATH` / `HERDR_PLUGIN_CONFIG_DIR` / `HERDR_PLUGIN_STATE_DIR`（herdr バイナリの文字列から存在確認済み）
- コミットはタスクごと。メッセージは日本語、末尾に `Co-Authored-By` 行を付けない

---

## File Structure

| ファイル | 責務 |
|---|---|
| `herdr-plugin.toml` | プラグイン宣言。イベント購読集合がここで確定する |
| `package.json` / `tsconfig.json` / `Makefile` | ツールチェイン |
| `lib/config.ts` | config.toml の読み込み・既定値・検証。他のどのモジュールにも依存しない |
| `lib/naming.ts` | 純粋関数のみ。`Config` 型だけに依存し、herdr を一切知らない |
| `lib/herdr.ts` | herdr CLI の呼び出しと JSON パース。ラベルの意味を知らない |
| `lib/lock.ts` | 実行の排他。ファイルシステムのみに依存 |
| `bin/renumber.ts` | 上記を組み合わせる唯一の場所 |

---

## Task 1: プロジェクト雛形と manifest

**Files:**
- Create: `package.json`, `tsconfig.json`, `Makefile`, `herdr-plugin.toml`
- Test: `test/manifest.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `herdr-plugin.toml` のイベント購読集合。Task 5 の `bin/renumber.ts` がこの manifest から起動される

- [ ] **Step 1: `package.json` を作る**

```json
{
  "name": "herdr-jump-number",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: `tsconfig.json` を作る**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["bin", "lib", "test"]
}
```

- [ ] **Step 3: `Makefile` を作る**

既存の `voice0726/herdr-plugin-sync` に合わせて `check` を入口にする。

```makefile
.PHONY: check typecheck test

check: typecheck test

typecheck:
	bun run typecheck

test:
	bun test
```

- [ ] **Step 4: 依存をインストールする**

Run: `bun install`
Expected: `bun.lock` が生成され、`node_modules/` ができる（`.gitignore` 済み）

- [ ] **Step 5: `herdr-plugin.toml` を作る**

```toml
id = "voice0726.jump-number"
name = "Jump Number"
version = "0.1.0"
description = "Show jump-key numbers on workspaces and tabs without breaking herdr's automatic labels."
min_herdr_version = "0.7.5"
platforms = ["linux", "macos"]

# ビルド工程は持たない([[build]] を書かない)。bun がソースを直接実行する。

[[startup]]
command = ["bun", "bin/renumber.ts"]

# workspace.metadata_updated は意図的に購読しない。
# 自分の report-metadata がこのイベントを発火するため、購読すると無限ループになる。
[[events]]
on = "workspace.created"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "workspace.moved"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "workspace.closed"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "tab.created"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "tab.moved"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "tab.closed"
command = ["bun", "bin/renumber.ts"]
[[events]]
on = "tab.renamed"
command = ["bun", "bin/renumber.ts"]

[[actions]]
id = "sync"
title = "Sync jump numbers"
contexts = ["global"]
command = ["bun", "bin/renumber.ts"]

[[actions]]
id = "reset"
title = "Remove jump numbers"
contexts = ["global"]
command = ["bun", "bin/renumber.ts", "--reset"]
```

- [ ] **Step 6: manifest の失敗するテストを書く**

`test/manifest.test.ts`:

```ts
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

const subscribed = new Set(manifest.events.map((e) => e.on));

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
    const reset = manifest.actions.find((a) => a.id === "reset");
    expect(reset?.command).toEqual(["bun", "bin/renumber.ts", "--reset"]);
  });

  test("platforms と min_herdr_version が固定されている", () => {
    expect(manifest.platforms).toEqual(["linux", "macos"]);
    expect(manifest.min_herdr_version).toBe("0.7.5");
  });
});
```

- [ ] **Step 7: テストを実行して通ることを確認する**

Run: `bun test test/manifest.test.ts`
Expected: 6 pass。manifest を先に書いているので最初から通る。**もし落ちたら Step 5 の manifest が計画と食い違っている。**

- [ ] **Step 8: 型チェックを実行する**

Run: `make check`
Expected: typecheck が通り、テストが通る

- [ ] **Step 9: コミット**

```bash
git add package.json tsconfig.json Makefile herdr-plugin.toml bun.lock test/manifest.test.ts .gitignore docs/
git commit -m "プロジェクト雛形と herdr プラグイン manifest を追加"
```

---

## Task 2: 設定の読み込みと検証

**Files:**
- Create: `lib/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type Config = { workspaces: boolean; tabs: boolean; workspaceToken: string; tabPrefix: string; maxNumber: number }`
  - `const DEFAULTS: Config`
  - `class ConfigError extends Error`
  - `function loadConfig(dir?: string): Config` — `dir` 省略時は `process.env.HERDR_PLUGIN_CONFIG_DIR`
  - `function validateConfig(cfg: Config): void` — 違反時 `ConfigError` を throw
  - `const PLACEHOLDER = "{n}"`

- [ ] **Step 1: 失敗するテストを書く**

`test/config.test.ts`:

```ts
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
    const cfg = loadConfig(dirWith('tabs = false\nmax_number = 5\n'));
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun test test/config.test.ts`
Expected: FAIL（`lib/config` が存在しない、というモジュール解決エラー）

- [ ] **Step 3: `lib/config.ts` を実装する**

```ts
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
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun test test/config.test.ts`
Expected: PASS（11 テスト）

- [ ] **Step 5: `config.example.toml` を作る**

```toml
# ~/.config/herdr/plugins/config/voice0726.jump-number/config.toml に置く。
# プラグインはイベントごとに読み直すので、編集しても herdr の再起動は不要。

# workspace 側 / tab 側の有効・無効。
# false にしても既に付いている表示は消えない(更新が止まるだけ)。
# 消したい場合は先に reset を実行する。README の手順を参照。
workspaces = true
tabs = true

# {n} が番号に置換される。どちらも {n} をちょうど 1 個含む必要がある。
workspace_token = "[{n}]"
tab_prefix = "{n}:"

# 番号を出す上限。herdr の jump key が 1..9 なので 1〜9 のみ。
max_number = 9
```

- [ ] **Step 6: `make check` を実行する**

Run: `make check`
Expected: typecheck とテストが通る

- [ ] **Step 7: コミット**

```bash
git add lib/config.ts test/config.test.ts config.example.toml
git commit -m "プラグイン設定の読み込みと検証を追加"
```

---

## Task 3: 命名の純粋関数

**Files:**
- Create: `lib/naming.ts`
- Test: `test/naming.test.ts`

**Interfaces:**
- Consumes: `lib/config.ts` の `Config`, `PLACEHOLDER`
- Produces:
  - `function escapeRegExp(value: string): string`
  - `function tabPrefixPattern(cfg: Config): RegExp`
  - `function tabBase(cfg: Config, label: string): string | null` — `null` = そのラベルに触らない
  - `function desiredTabLabel(cfg: Config, current: string, number: number): string | null` — `null` = 触らない
  - `function desiredWorkspaceToken(cfg: Config, number: number): string | null` — `null` = トークンを消す

- [ ] **Step 1: 失敗するテストを書く**

`test/naming.test.ts`:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun test test/naming.test.ts`
Expected: FAIL（`lib/naming` が存在しない）

- [ ] **Step 3: `lib/naming.ts` を実装する**

```ts
import { PLACEHOLDER, type Config } from "./config";

/** 正規表現メタ文字を無害化する。書式のリテラル部分をパターンに埋め込むために使う。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * tab_prefix の書式から prefix 除去用のパターンを導出する。
 * リテラル部分はエスケープし、{n} だけを \d+ に置き換える。
 * 既定値 "{n}:" なら /^\d+:/ になる。
 */
export function tabPrefixPattern(cfg: Config): RegExp {
  const index = cfg.tabPrefix.indexOf(PLACEHOLDER);
  const head = escapeRegExp(cfg.tabPrefix.slice(0, index));
  const tail = escapeRegExp(cfg.tabPrefix.slice(index + PLACEHOLDER.length));
  return new RegExp(`^${head}\\d+${tail}`);
}

/**
 * ラベルから prefix を繰り返し剥がして base を得る。
 * null は「このラベルには触らない」を意味する:
 *   - 空ラベル
 *   - prefix だけで base が空になるラベル(剥がすと空ラベルを作ってしまう)
 */
export function tabBase(cfg: Config, label: string): string | null {
  const pattern = tabPrefixPattern(cfg);
  let current = label;
  for (;;) {
    const next = current.replace(pattern, "");
    if (next === current) return current === "" ? null : current;
    if (next === "") return null;
    current = next;
  }
}

/** null = その tab に触らない。 */
export function desiredTabLabel(
  cfg: Config,
  current: string,
  number: number,
): string | null {
  // 全桁数字は herdr の既定ラベル(= tab 番号そのもの)。既に番号が出ているので触らない。
  if (/^\d+$/.test(current)) return null;

  const base = tabBase(cfg, current);
  if (base === null) return null;

  const desired =
    number <= cfg.maxNumber
      ? cfg.tabPrefix.replace(PLACEHOLDER, String(number)) + base
      : base;

  return desired === current ? null : desired;
}

/** null = トークンを消す。 */
export function desiredWorkspaceToken(
  cfg: Config,
  number: number,
): string | null {
  if (number > cfg.maxNumber) return null;
  return cfg.workspaceToken.replace(PLACEHOLDER, String(number));
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun test test/naming.test.ts`
Expected: PASS（18 テスト）

- [ ] **Step 5: `make check` を実行する**

Run: `make check`
Expected: 全部通る

- [ ] **Step 6: コミット**

```bash
git add lib/naming.ts test/naming.test.ts
git commit -m "ラベルとトークンの期待値を決める純粋関数を追加"
```

---

## Task 4: herdr CLI アダプタと排他ロック

**Files:**
- Create: `lib/herdr.ts`, `lib/lock.ts`
- Test: `test/lock.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `const SOURCE = "voice0726.jump-number"`
  - `type WorkspaceInfo = { workspace_id: string; number: number; label: string }`
  - `type TabInfo = { tab_id: string; workspace_id: string; number: number; label: string }`
  - `class HerdrError extends Error`
  - `function listWorkspaces(): WorkspaceInfo[]`
  - `function listTabs(): TabInfo[]`
  - `function setWorkspaceToken(id: string, name: string, value: string): void`
  - `function clearWorkspaceToken(id: string, name: string): void`
  - `function renameTab(tabId: string, label: string): void`
  - `function withLock<T>(fn: () => T): T | null` — `null` = ロックを取れず何もしなかった

- [ ] **Step 1: ロックの失敗するテストを書く**

`test/lock.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withLock } from "../lib/lock";

function freshLockPath(): string {
  return join(mkdtempSync(join(tmpdir(), "jumpnum-lock-")), "renumber.lock");
}

describe("withLock", () => {
  test("ロックを取れたら関数を実行して結果を返す", () => {
    const path = freshLockPath();
    expect(withLock(() => 42, { path })).toBe(42);
  });

  test("実行後にロックを解放する", () => {
    const path = freshLockPath();
    withLock(() => 1, { path });
    expect(existsSync(path)).toBe(false);
  });

  test("関数が例外を投げてもロックを解放する", () => {
    const path = freshLockPath();
    expect(() =>
      withLock(() => {
        throw new Error("boom");
      }, { path }),
    ).toThrow("boom");
    expect(existsSync(path)).toBe(false);
  });

  test("保持中のロックが期限内に空かなければ null を返して何もしない", () => {
    const path = freshLockPath();
    writeFileSync(path, String(process.pid));
    let ran = false;
    const result = withLock(() => {
      ran = true;
      return 1;
    }, { path, waitMs: 100, staleMs: 60_000 });
    expect(result).toBeNull();
    expect(ran).toBe(false);
  });

  test("stale なロックは奪って実行する", () => {
    // ロックを持ったプロセスが落ちた場合に永久に詰まらないようにする。
    const path = freshLockPath();
    writeFileSync(path, "99999");
    const old = new Date(Date.now() - 120_000);
    utimesSync(path, old, old);
    expect(withLock(() => "ok", { path, waitMs: 100, staleMs: 60_000 })).toBe("ok");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `bun test test/lock.test.ts`
Expected: FAIL（`lib/lock` が存在しない）

- [ ] **Step 3: `lib/lock.ts` を実装する**

```ts
import { closeSync, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_WAIT_MS = 5_000;
const DEFAULT_STALE_MS = 30_000;
const POLL_MS = 50;

export type LockOptions = {
  path?: string;
  waitMs?: number;
  staleMs?: number;
};

export function defaultLockPath(): string {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR ?? tmpdir();
  return join(dir, "renumber.lock");
}

function tryAcquire(path: string): number | null {
  try {
    // "wx" は排他生成。既に存在すれば EEXIST で失敗する。
    return openSync(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
}

function breakIfStale(path: string, staleMs: number): void {
  try {
    if (Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
  } catch {
    // 競合で既に消えている場合は無視してよい。次の取得試行で決着する。
  }
}

/**
 * 排他ロックを取得して fn を実行する。
 *
 * 一覧を読む「前」に呼ぶこと。読んだ後にロックしても、古い一覧で新しい番号を
 * 上書きする競合は防げない。待たされた実行がロック取得後に読み直すことで、
 * 常に最新の一覧を見ることが保証される。
 *
 * 期限内にロックを取れなかった場合は null を返して何もしない。
 * 先行する実行が最新状態で処理するため、取りこぼしにはならない。
 */
export function withLock<T>(fn: () => T, options: LockOptions = {}): T | null {
  const path = options.path ?? defaultLockPath();
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const deadline = Date.now() + waitMs;

  for (;;) {
    const fd = tryAcquire(path);
    if (fd !== null) {
      try {
        writeSync(fd, String(process.pid));
        closeSync(fd);
        return fn();
      } finally {
        try {
          unlinkSync(path);
        } catch {
          // 既に消えていても問題ない。
        }
      }
    }
    breakIfStale(path, staleMs);
    if (Date.now() >= deadline) return null;
    Bun.sleepSync(POLL_MS);
  }
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `bun test test/lock.test.ts`
Expected: PASS（5 テスト）

- [ ] **Step 5: `lib/herdr.ts` を実装する**

herdr CLI そのものを叩くテストはここでは書かない。argv の契約は Task 5 の偽 herdr で検証する。

```ts
export const SOURCE = "voice0726.jump-number";

export type WorkspaceInfo = {
  workspace_id: string;
  number: number;
  label: string;
};

export type TabInfo = {
  tab_id: string;
  workspace_id: string;
  number: number;
  label: string;
};

export class HerdrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HerdrError";
  }
}

function herdrBin(): string {
  return process.env.HERDR_BIN_PATH ?? "herdr";
}

/** herdr CLI を実行し result オブジェクトを返す。失敗時は HerdrError。 */
export function run(args: string[]): Record<string, unknown> {
  const proc = Bun.spawnSync([herdrBin(), ...args]);
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new HerdrError(
      `herdr ${args.join(" ")} が exit ${proc.exitCode}: ${proc.stderr.toString().trim()}`,
    );
  }

  let parsed: { result?: Record<string, unknown>; error?: { message?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new HerdrError(
      `herdr ${args.join(" ")} の出力が JSON ではない: ${stdout.slice(0, 200)}`,
    );
  }

  if (parsed.error) {
    throw new HerdrError(
      `herdr ${args.join(" ")} がエラー応答: ${parsed.error.message ?? JSON.stringify(parsed.error)}`,
    );
  }
  if (!parsed.result) {
    throw new HerdrError(`herdr ${args.join(" ")} の応答に result が無い`);
  }
  return parsed.result;
}

export function listWorkspaces(): WorkspaceInfo[] {
  const result = run(["workspace", "list"]);
  return (result.workspaces ?? []) as WorkspaceInfo[];
}

/** herdr tab list は全 workspace の tab を返す(design.md 3 節で検証済み)。 */
export function listTabs(): TabInfo[] {
  const result = run(["tab", "list"]);
  return (result.tabs ?? []) as TabInfo[];
}

export function setWorkspaceToken(id: string, name: string, value: string): void {
  run(["workspace", "report-metadata", id, "--source", SOURCE, "--token", `${name}=${value}`]);
}

export function clearWorkspaceToken(id: string, name: string): void {
  run(["workspace", "report-metadata", id, "--source", SOURCE, "--clear-token", name]);
}

export function renameTab(tabId: string, label: string): void {
  run(["tab", "rename", tabId, label]);
}
```

- [ ] **Step 6: `make check` を実行する**

Run: `make check`
Expected: 全部通る

- [ ] **Step 7: コミット**

```bash
git add lib/herdr.ts lib/lock.ts test/lock.test.ts
git commit -m "herdr CLI アダプタと実行の排他ロックを追加"
```

---

## Task 5: 統合エントリポイント

**Files:**
- Create: `bin/renumber.ts`
- Test: `test/renumber.test.ts`, `test/fixtures/fake-herdr.ts`

**Interfaces:**
- Consumes: `lib/config.ts`, `lib/naming.ts`, `lib/herdr.ts`, `lib/lock.ts` のすべての公開関数
- Produces: CLI エントリポイント。`bun bin/renumber.ts` / `bun bin/renumber.ts --reset`

- [ ] **Step 1: 偽 herdr を作る**

`test/fixtures/fake-herdr.ts`。argv を 1 行 1 呼び出しの JSON で記録し、`*_LIST` 環境変数の内容を応答として返す。

```ts
#!/usr/bin/env bun
// テスト用の偽 herdr。argv を FAKE_HERDR_LOG に追記し、
// FAKE_HERDR_WORKSPACES / FAKE_HERDR_TABS の内容を応答として返す。
// FAKE_HERDR_FAIL に "workspace list" などを入れると、その呼び出しだけ失敗させられる。
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const log = process.env.FAKE_HERDR_LOG;
if (log) appendFileSync(log, JSON.stringify(args) + "\n");

const key = args.slice(0, 2).join(" ");
const failing = (process.env.FAKE_HERDR_FAIL ?? "").split(",").filter(Boolean);
if (failing.includes(key) || failing.includes(args.join(" "))) {
  process.stderr.write("fake failure\n");
  process.exit(1);
}

if (key === "workspace list") {
  process.stdout.write(
    JSON.stringify({
      id: "fake",
      result: { workspaces: JSON.parse(process.env.FAKE_HERDR_WORKSPACES ?? "[]") },
    }),
  );
} else if (key === "tab list") {
  process.stdout.write(
    JSON.stringify({
      id: "fake",
      result: { tabs: JSON.parse(process.env.FAKE_HERDR_TABS ?? "[]") },
    }),
  );
} else {
  process.stdout.write(JSON.stringify({ id: "fake", result: { type: "ok" } }));
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/renumber.test.ts`:

```ts
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
    const renames = calls.filter((c) => c[0] === "workspace" && c[1] === "rename");
    expect(renames).toEqual([]);
  });

  test("トークン名は jumpnum である", () => {
    // --source はトークンを名前空間分離しないため、汎用名 num は他プラグインと衝突する。
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const tokenCall = calls.find((c) => c.includes("--token"));
    expect(tokenCall?.[tokenCall.indexOf("--token") + 1]).toBe("jumpnum=[1]");
  });

  test("max_number 超過の workspace には --clear-token を発行する", () => {
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const clear = calls.find((c) => c.includes("--clear-token"));
    expect(clear).toBeDefined();
    expect(clear?.[2]).toBe("w2");
    expect(clear?.[clear.indexOf("--clear-token") + 1]).toBe("jumpnum");
  });

  test("既定ラベルの tab には rename を発行しない", () => {
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const renamed = calls.filter((c) => c[0] === "tab" && c[1] === "rename").map((c) => c[2]);
    expect(renamed).not.toContain("w1:t1");
  });

  test("複数 workspace にまたがる tab を 1 回で処理する", () => {
    // tab list は全 workspace を返すので、cross-workspace move の両側が更新される。
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS });
    const renamed = calls.filter((c) => c[0] === "tab" && c[1] === "rename");
    expect(renamed).toContainEqual(["tab", "rename", "w1:t2", "2:review"]);
    expect(renamed).toContainEqual(["tab", "rename", "w2:t1", "1:notes"]);
  });

  test("tabs = false のとき tab rename を一切発行しない", () => {
    const { calls } = runPlugin({ workspaces: WS, tabs: TABS, configToml: "tabs = false\n" });
    expect(calls.filter((c) => c[0] === "tab" && c[1] === "rename")).toEqual([]);
  });

  test("workspaces = false のとき report-metadata を発行しない", () => {
    const { calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      configToml: "workspaces = false\n",
    });
    expect(calls.filter((c) => c[1] === "report-metadata")).toEqual([]);
  });

  test("--reset は無効化されていても両方を後始末する", () => {
    const { calls } = runPlugin({
      workspaces: WS,
      tabs: TABS,
      configToml: "workspaces = false\ntabs = false\n",
      args: ["--reset"],
    });
    expect(calls.filter((c) => c.includes("--clear-token")).length).toBe(2);
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
    const { exitCode, calls } = runPlugin({ workspaces: WS, tabs: TABS, fail: "workspace list" });
    expect(exitCode).not.toBe(0);
    expect(calls.filter((c) => c[1] === "rename" || c[1] === "report-metadata")).toEqual([]);
  });

  test("tab list 失敗時も変更系を発行せず非 0 終了する", () => {
    // 片方だけの検証で満足しない。
    const { exitCode, calls } = runPlugin({ workspaces: WS, tabs: TABS, fail: "tab list" });
    expect(exitCode).not.toBe(0);
    expect(calls.filter((c) => c[1] === "rename" || c[1] === "report-metadata")).toEqual([]);
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
```

- [ ] **Step 3: 偽 herdr の shim を作る**

`HERDR_BIN_PATH` は実行可能ファイルを指す必要があるため、bun 経由で fixture を起動する薄い shell script を挟む。

`test/fixtures/fake-herdr-shim.sh`:

```bash
#!/usr/bin/env bash
exec bun "$FAKE_HERDR_BIN" "$@"
```

実行権を付ける:

Run: `chmod +x test/fixtures/fake-herdr-shim.sh`

- [ ] **Step 4: テストを実行して失敗を確認する**

Run: `bun test test/renumber.test.ts`
Expected: FAIL（`bin/renumber.ts` が存在しない）

- [ ] **Step 5: `bin/renumber.ts` を実装する**

```ts
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

function syncWorkspaces(cfg: Config, workspaces: WorkspaceInfo[], failures: string[]): void {
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
```

- [ ] **Step 6: テストを実行して通ることを確認する**

Run: `bun test test/renumber.test.ts`
Expected: PASS（13 テスト）

- [ ] **Step 7: 全テストと型チェックを実行する**

Run: `make check`
Expected: 全部通る（合計 53 テスト前後）

- [ ] **Step 8: コミット**

```bash
git add bin/renumber.ts test/renumber.test.ts test/fixtures/
git commit -m "番号同期の統合エントリポイントを追加"
```

---

## Task 6: README と実機確認

**Files:**
- Create: `README.md`
- Test: 実機（herdr 上での手動確認）

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: なし（最終タスク）

- [ ] **Step 1: `README.md` を書く**

以下を必ず含める。

````markdown
# herdr-jump-number

herdr の jump key に対応する番号を、workspace ラベルを rename せずに表示するプラグイン。

## なぜ rename しないのか

herdr は `workspace.rename` を一度でも呼ぶと、その workspace のラベルを手動ラベルとして
固定し、cwd からの自動命名を恒久的に停止する。空文字 rename でも復旧せず、workspace を
作り直す以外に戻す手段が無い。

本プラグインは workspace には表示専用の `report-metadata` トークンだけを使い、label に
触れない。詳細は `docs/design.md`。

## インストール

```sh
herdr plugin link .
```

`~/.config/herdr/config.toml` の `[ui.sidebar.spaces]` に `$jumpnum` を追加する:

```toml
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

```sh
herdr server reload-config
```

## 設定

`herdr plugin config-dir voice0726.jump-number` が表示するディレクトリに
`config.toml` を置く。項目は `config.example.toml` を参照。

## アンインストール / 書式変更

**必ず disable してから reset すること。** reset の tab rename が `tab.renamed` を発火し、
それを購読した通常の同期が prefix を付け直してしまうため。

```sh
herdr plugin disable voice0726.jump-number
bun bin/renumber.ts --reset
# ここで uninstall するか、config.toml の書式を変更する
```

## 既知の制約

- tab ラベル先頭の `tab_prefix` 形式はプラグインの予約領域。既定書式で `1:30 standup` の
  ような名前を付けると、`1:` が prefix と誤認され `30 standup` が base として扱われる
- 全桁数字の tab 名（例 `2024`）は herdr の既定ラベルと区別できないため番号が付かない
- workspace のトークン名はグローバル。同名 `jumpnum` を使う別プラグインとは共存できない

## 開発

```sh
make check   # typecheck + bun test
```
````

- [ ] **Step 2: 実機に link する**

Run: `herdr plugin link .`
Expected: `herdr plugin list` に `voice0726.jump-number` が enabled で出る

- [ ] **Step 3: sidebar 設定を入れる**

`~/.config/herdr/config.toml` の `[ui.sidebar.spaces]` の `rows` に `$jumpnum` を追加し、
`herdr server reload-config` を実行する。

Expected: `status: applied`、`diagnostics` が空

- [ ] **Step 4: 実機で workspace 番号を確認する**

Run: `herdr plugin action invoke voice0726.jump-number.sync` の後に `herdr workspace list`
Expected: 各 workspace に `tokens: {"jumpnum": "[N]"}` が付き、**`label` が変化していない**

- [ ] **Step 5: 実機で cwd 追随が生きていることを確認する**

新しい workspace を作り、その pane で `cd` してから `herdr workspace list` を見る。

Expected: `label` が新しいディレクトリ名に追随する（これが本プラグインの成否そのもの）

- [ ] **Step 6: 実機で tab 番号を確認する**

tab を 2 枚作り、片方に `review` という名前を付ける。

Expected: 名前なしの tab は `1` のまま、名前を付けた tab が `2:review` になる

- [ ] **Step 7: reset の手順を実機で確認する**

```sh
herdr plugin disable voice0726.jump-number
bun bin/renumber.ts --reset
herdr workspace list
herdr tab list
```

Expected: `tokens` が消え、tab の prefix が剥がれている。再 enable するまで戻らない

- [ ] **Step 8: 再度 enable して状態を戻す**

Run: `herdr plugin enable voice0726.jump-number`

- [ ] **Step 9: コミット**

```bash
git add README.md
git commit -m "README と実機確認手順を追加"
```

---

## Self-Review 記録

**Spec coverage:** design.md の各節と対応するタスク。

| design.md | 対応 |
|---|---|
| 4.1 workspace 経路 | Task 3（`desiredWorkspaceToken`）, Task 4（`setWorkspaceToken` / `clearWorkspaceToken`）, Task 5 |
| 4.2 tab 経路の判定表 | Task 3 のテーブルテスト全 8 ケース |
| 4.3 予約領域の不変条件・多重 prefix | Task 3（`tabBase` の繰り返し剥がし、不変条件のテスト） |
| 4.4 設定と検証表 | Task 2 |
| 5 コンポーネント境界 | Task 2〜5 のファイル分割 |
| 6 データフロー / 6.1 ロック / 6.2 reset | Task 4（`withLock`）, Task 5（`main` の順序） |
| 7 イベントフック / 7.1 reset 手順 | Task 1（manifest とそのテスト）, Task 6（README） |
| 8 失敗時の挙動 | Task 5 の失敗経路テスト 4 件 |
| 9.1〜9.4 テスト | Task 3 / Task 2 / Task 5 / Task 1 |
| 10 実装構成 | Task 1 |
| 11 移行手順 | Task 6（README + 実機確認） |
| 12 既知の制約 | Task 6（README） |

**Placeholder scan:** 実施済み。全ステップに実コードまたは実行コマンドと期待結果がある。

**Type consistency:** `Config` のプロパティ名（`workspaces` / `tabs` / `workspaceToken` / `tabPrefix` / `maxNumber`）は Task 2 の定義と Task 3・5 の使用箇所で一致。`tabBase` / `desiredTabLabel` / `desiredWorkspaceToken` の名前と引数順は Task 3 の定義と Task 5 の呼び出しで一致。`TOKEN_NAME = "jumpnum"` は Task 5 で定義し、Task 5 のテストが値を固定している。
