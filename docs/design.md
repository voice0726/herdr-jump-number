# 設計: herdr-jump-number

plugin id: `voice0726.jump-number` / 作成日: 2026-07-28

## 0. 仕様サマリ

herdr の jump key（`prefix+1..9` = tab、`prefix+shift+1..9` = workspace）に対応する番号を、**そのラベルが本来持っている情報を壊さずに**表示する。

- workspace: `report-metadata` の表示専用トークン `$jumpnum` として `[1]`〜`[9]` を出す。**label を rename しない**
- tab: label に `3:review` の形で prefix を埋め込む。**既定ラベル（全桁数字）には触らない**
- 状態ファイルを持たない
- 書式と有効範囲は plugin config で変更できる（4.4 節）

## 1. 背景と問題

herdr-pane-name（`go-min/herdr-pane-name`）を導入したところ、sidebar の workspace 名がディレクトリを変えても更新されなくなった。ブランチ表示だけは追随していた。

調査の結果、原因は herdr 側の仕様にあることが分かった。実測による対照実験:

| 条件 | `~` で作成時のラベル | `cd /tmp` 後 |
|---|---|---|
| プラグイン無効 | `~` | `tmp`（追随する） |
| herdr-pane-name 有効 | `3:~` | `3:~`（固定） |
| プラグイン無効 + 手動 `workspace rename` | `3:tmp` | `3:tmp`（固定） |

3 行目が決定的で、プラグインの有無ではなく **`workspace.rename` という操作自体**が自動命名を停止させる。herdr の workspace ラベルには「自動か手動か」を示すフィールドが無く、`rename` が呼ばれた時点で手動ラベルとして扱われるため。

ブランチだけ追随していたのは、`[ui.sidebar.spaces]` の `rows` において `branch` / `git_status` が workspace ラベルとは別系統の built-in トークンで、herdr が cwd から毎回算出しているため。固定されるのは `workspace` トークン（= ラベル文字列）だけだった。

herdr-pane-name の README「API boundary」節はこの限界を自ら認めており、`label_source` の追加を herdr 本体に要望している。したがってこれはプラグインの実装バグではなく、rename でプレフィックスを付ける方式すべてに共通する構造的な制約である。

### 復旧不能な点（実測済み）

- 空文字 rename（`herdr workspace rename <id> ""`）はラベルを `''` にするだけで自動命名を復活させない
- `herdr.pane-name.reset` は prefix 無しの旧ラベルへ rename するだけなので、やはり固定されたまま
- **一度 rename された workspace は、作り直す以外に自動命名へ戻す手段が無い**

## 2. 目的とスコープ

### やること

- workspace に jump 番号を表示する（cwd 自動命名を維持したまま）
- ユーザーが名前を付けた tab に jump 番号を表示する

### やらないこと

- フォアグラウンドプロセス名による自動命名、アイコン付与、pane の命名。これらは herdr-pane-name を撤去して捨てる
- pane への番号付与。`1..9` で pane を直接ジャンプするキーバインドを設定していないため、表示上の意味が無い

## 3. 検証済みの前提

実装が依存する herdr 0.7.5 の挙動。すべて実機で確認済み。

| 前提 | 確認結果 |
|---|---|
| `workspace report-metadata --token <name>=X` が通る | ✅ `workspace list` に `tokens: {"<name>": "X"}` が出る |
| 上記が label を書き換えないか | ✅ 書き換えない |
| `$<name>` を `[ui.sidebar.spaces] rows` に置けるか | ✅ `reload-config` が `status: applied`、diagnostics 空 |
| トークン名のバリデーションが機能しているか | ✅ `bogus_token` は `unknown sidebar token` で拒否される（`$<name>` の受理は素通しではない） |
| **`--source` がトークンを名前空間分離するか** | ❌ **しない。** `--source srcB --clear-token num` が `srcA` の設定した `num` を消した。トークン名はグローバルなので、プラグイン固有の名前を使う必要がある |
| `tab list` の返す範囲 | ✅ **全 workspace の tab を返す**（`workspace_id` フィールドで判別）。1 回のスキャンで cross-workspace move の両側が処理される |
| tab に `report-metadata` があるか | ❌ 無い（`herdr tab` は list/create/get/focus/rename/close のみ） |
| tab bar に行・トークンのカスタマイズ設定があるか | ❌ 無い（`hide_tab_bar_when_single_tab` のみ） |
| tab の既定ラベル | **tab 番号そのもの**（`1`, `2`, `3`）。名前を付けた tab だけ番号が消える |
| `workspace list` / `tab list` が `number` を返すか | ✅ 返す。tab の `number` は workspace 内でのローカル位置 |
| bun が plugin プロセスから起動できるか | ✅ herdr-wait の `bun bin/enrich.ts` が exit_code 0 |

tab に `report-metadata` が無く tab bar にトークン設定も無いため、**tab の番号は rename でしか出せない**。ただし tab ラベルは cwd 由来の自動命名を持たないので、workspace のような副作用は生じない。

## 4. アーキテクチャ

番号の出所は 1 つ（herdr が各 workspace/tab に持つ `number`）だが、**出力経路が 2 つに分かれる**。これが設計の中心。

```
                    herdr workspace list / tab list
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
              workspace 経路             tab 経路
          report-metadata (表示専用)    rename (ラベル書換)
                     │                       │
              label に触れない          既定ラベルには触れない
                     │                       │
          cwd 自動命名が生き続ける      ユーザー命名を base として保持
```

### 4.1 workspace 経路

```
number ≤ max_number → workspace report-metadata <id> --source voice0726.jump-number --token jumpnum=<書式適用>
number > max_number → workspace report-metadata <id> --source voice0726.jump-number --clear-token jumpnum
```

label には一切触れない。これが問題 1 の回避そのもの。表示は利用者が `[ui.sidebar.spaces]` の `rows` に `$jumpnum` を置くことで実現する（プラグインは herdr の config.toml を書き換えない）。

トークン値は常に上書きするだけでパースが不要なので、書式変更に伴う危険が無い。

**トークン名を `num` ではなく `jumpnum` にするのは、`--source` がトークンを名前空間分離しないため**（3 節で検証済み）。別 source からの `--clear-token num` が本プラグインの値を消せてしまうので、衝突しにくい固有名を使う。`--source` は「誰が設定したか」の記録用であって、隔離境界ではない。

### 4.2 tab 経路

既定書式 `tab_prefix = "{n}:"` の場合の挙動:

| 現在のラベル | number | 動作 | 理由 |
|---|---|---|---|
| `1`（全桁数字） | 1 | 触らない | herdr の既定ラベルが既に番号 |
| `review` | 3 | → `3:review` | ユーザー命名に番号を付与 |
| `3:review` | 3 | 触らない | 変更不要（冪等） |
| `1:review` | 3 | → `3:review` | 位置変更に追随 |
| `2:3:review` | 3 | → `3:review` | 多重 prefix を正規化 |
| `review` | 12 | 触らない | `max_number` 超過。jump key が無い |
| `3:review` | 12 | → `review` | `max_number` 超過。prefix を剥がす |
| `3:`（base 空） | 3 | 触らない | 想定外入力。安全側に倒す |

### 4.3 状態ファイルを持たない理由

herdr-pane-name は `labels.json` でラベル所有権を管理している。これは同プラグインが**ラベルを生成する**（プロセス名 + アイコン）ため、「自分が生成した自動ラベル」と「ユーザーの手動ラベル」を区別する必要があるから。

本プラグインは名前を生成せず prefix しか触らない。base 名は書式から導出した正規表現を剥がせば復元できるので、**prefix の有無だけで判定が閉じる**。ゆえに永続状態は不要で、これが herdr-pane-name より構造的に単純になる最大の点である。

ただしこれは無条件には成立しない。**次の不変条件を仕様として受け入れることが前提である。**

> **予約領域の不変条件**: tab ラベル先頭の `tab_prefix` 形式（既定では `<数字>:`）はプラグインの予約領域であり、ユーザーはそこを自分の名前の一部として使えない。

この不変条件を破る入力（既定書式なら `1:30 standup`）に対しては、プラグインが `1:` を自分の prefix と誤認し、`30 standup` を base として扱う。以後の移動・`max_number` 変更・reset でユーザー入力の一部が不可逆に失われる。**これは「表示が古くなるだけ」では済まない唯一の失敗経路であり、状態を持たない設計の代償である。** エスケープ機構やオプトアウトは実装しない（代償を仕様として明示し、テストで固定する方を選ぶ）。

**prefix の除去は「base が空にならない限り繰り返す」。** 単発置換だと 4.2 節が要求する `2:3:review` → `3:review` を満たせない。剥がした結果が空文字になる場合はその 1 段を戻し、そのラベルには触らない（`3:` のような prefix だけのラベルは、番号が違っていても放置する。極めて稀で、誤って空ラベルを作るより安全なため）。

### 4.4 設定

`HERDR_PLUGIN_CONFIG_DIR` 直下の `config.toml` を毎回読む（herdr-pane-name と同じく再起動不要）。ファイルが無い場合は既定値。

```toml
workspaces = true        # workspace 側の有効/無効
tabs = true              # tab 側の有効/無効
workspace_token = "[{n}]"
tab_prefix = "{n}:"
max_number = 9           # 番号を出す上限
```

`{n}` が番号に置換される。`workspaces` / `tabs` の on/off は実装コストがほぼゼロな割に「tab 側だけ止めたい」に即答できるため入れる。`max_number` は jump key の設定次第で 9 未満にしたい場合に効く。

**`tab_prefix` のパーサは書式から導出する。** リテラル部分を正規表現エスケープし、`{n}` を `\d+` に置換したものを prefix パターンとする。既定値 `"{n}:"` なら `/^\d+:/` になる。

#### 検証（すべて非 0 終了）

| 項目 | 条件 | 理由 |
|---|---|---|
| `tab_prefix` の `{n}` | ちょうど 1 個 | 0 個だと剥がすべき prefix を特定できず、**実行のたびにラベルが伸び続ける**。2 個以上は導出パターンが曖昧になる |
| `workspace_token` の `{n}` | ちょうど 1 個 | 0 個だと全 workspace が同じ固定値になり、番号表示という目的自体が壊れる |
| `max_number` | 1 以上 9 以下の整数 | herdr の jump key が `1..9` のため。0 や 10 以上は設定ミスとして扱う |
| `workspaces` / `tabs` | 真偽値 | — |

#### `workspaces = false` / `tabs = false` の意味

**「以後の更新を止める」であって「既存の表示を消す」ではない。** 無効化しても既に付いているトークンや prefix は残る。消したい場合は先に `reset` を実行する（`reset` は無効化されていても両方を後始末する）。

#### 書式変更の手順

旧書式の prefix は新しい書式のパーサに認識されず二重付与になるため、**変更前に reset が必要**。安全な手順は 7 節の reset 手順に従うこと。自動移行は実装しない（判断根拠は 12 節）。

## 5. コンポーネント

| ファイル | 責務 | 依存 |
|---|---|---|
| `lib/config.ts` | config.toml の読み込み・既定値・検証 | `HERDR_PLUGIN_CONFIG_DIR` |
| `lib/naming.ts` | 純粋関数のみ。ラベル/トークンの期待値を決める | `Config` 型のみ |
| `lib/herdr.ts` | herdr CLI の呼び出しと JSON パース | `HERDR_BIN_PATH` |
| `lib/lock.ts` | 実行の排他（6.1 節） | ファイルシステム |
| `bin/renumber.ts` | ロック取得 → 一覧取得 → 期待値算出 → 差分適用の統合 | 上記 4 つ |

`lib/naming.ts` の公開インターフェース:

```ts
export type Config = {
  workspaces: boolean;
  tabs: boolean;
  workspaceToken: string;
  tabPrefix: string;
  maxNumber: number;
};

/** tab_prefix から prefix 除去用の正規表現を導出する */
export function tabPrefixPattern(cfg: Config): RegExp;

/** null = そのタブに触らない */
export function desiredTabLabel(cfg: Config, current: string, number: number): string | null;

/** null = トークンを消す */
export function desiredWorkspaceToken(cfg: Config, number: number): string | null;
```

`naming.ts` は herdr を知らず、`herdr.ts` はラベルの意味を知らない。判定ロジックだけを CLI 抜きでテストできる。

## 6. データフロー

1. config.toml を読んで検証する（4.4 節の検証に反したらここで非 0 終了）
2. **排他ロックを取得する**（下記）
3. `herdr workspace list` と `herdr tab list` を実行（有効な側のみ）
4. `workspaces = true` なら、workspace ごとに `desiredWorkspaceToken(cfg, number)` を求め、`--token` か `--clear-token` を発行
5. `tabs = true` なら、tab ごとに `desiredTabLabel(cfg, label, number)` を求め、`null` でなければ `tab rename` を発行
6. ロックを解放し、発行した各コマンドの成否を集計

全 workspace / 全 tab を毎回洗い替えする。対象は高々数十件なので差分最適化はしない。`tab list` は全 workspace の tab を返す（3 節で検証済み）ため、cross-workspace move でも移動元・移動先の両方が同じ 1 回のスキャンで処理される。

### 6.1 排他ロック

herdr はイベントごとに独立したプロセスを起動するため、`workspace.closed` と `tab.moved` が近接すると複数の実行が並走する。**一覧を読んだ後に別の実行が書き込むと、古い番号で上書きされうる。**

対策は、ファイルロック（`flock` 相当）を取得**してから**一覧を取得すること。順序が重要で、ロックの前に読むと意味がない。ロック取得は短い上限付きで待ち、超えたら「別の実行が最新状態で処理する」と判断して 0 終了する。

codex レビューで提案されたイベントの coalesce は実装しない。**ロック取得後に読み直す限り、待たされた実行は必ず最新の一覧を見る**ので、取りこぼしは発生しない。キューを持つ複雑さに見合わない。

### 6.2 `--reset`

4 と 5 の代わりに、全 workspace の `jumpnum` トークンを `--clear-token` し、全 tab の prefix を剥がす。`workspaces` / `tabs` が `false` でも reset は両方に対して行う（無効化した後に後始末できないと困るため）。

## 7. イベントフックとループ防止

すべてのフックが同一コマンド `bun bin/renumber.ts` を呼ぶ。

```toml
[[startup]]
[[events]] on = "workspace.created"
[[events]] on = "workspace.moved"
[[events]] on = "workspace.closed"
[[events]] on = "tab.created"
[[events]] on = "tab.moved"
[[events]] on = "tab.closed"
[[events]] on = "tab.renamed"
```

**`workspace.metadata_updated` は購読しない。** 自分の `report-metadata` がこのイベントを発火するため、購読すると無限ループになる。

`tab.renamed` は購読するが、自分の rename が同イベントを発火しても、変換が冪等（`3:review` → `3:review`）で期待値と現在値が一致するときは rename を発行しないため、余分な 1 回で停止する。

action も同じコマンドに接続する:

- `sync`: 手動で同期
- `reset`: トークンを消し、tab の prefix を剥がす（`--reset`）

### 7.1 reset は単体では完結しない

**`reset` の tab rename が `tab.renamed` を発火し、それを購読した通常の同期が prefix を付け直す。** ロック（6.1 節）は同時実行を直列化するだけで、reset の**後に**届くイベントは防げない。したがって reset を plugin action として実行するだけでは、最終状態が非決定的になる。

安全な手順は、**イベント購読を止めてから reset を実行する**こと:

```sh
herdr plugin disable voice0726.jump-number
cd <plugin root> && bun bin/renumber.ts --reset
# ここで uninstall するか、config の書式を変更する
```

`reset` action 自体は残すが、これは「今すぐ表示だけ消したい」用の簡易手段であり、**アンインストール前・書式変更前の正式手順は上記の disable 経由**とする。README と 11 節にこの順序を書く。

この制約は herdr のイベントモデル（プラグインが自分の書き込み由来のイベントを購読対象から除外できない）に由来するもので、本プラグイン側では解消できない。

## 8. 失敗時の挙動

herdr CLI が非 0 を返した場合、その workspace/tab をスキップして残りを処理し、最後にまとめて非 0 終了 + stderr へ要約を出す。`herdr plugin log list` に残る。

**表示が古くなる方向にだけ倒れ、ユーザーのラベルを壊す方向には倒れない。** 具体的には、`workspace list` / `tab list` の取得に失敗した時点で何も適用せず終了する（不完全な一覧に基づいて番号を振り直すと、実在する tab の prefix を誤って剥がしうるため）。

## 9. テスト

`make check` で型チェックと `bun test` を実行する。

### 9.1 純粋関数のテーブルテスト（`test/naming.test.ts`）

4.2 節の表をそのままケースにする。各ケースが独立した仕様理由に対応しており、固定値を返す実装では通らない:

- 既定ラベル（全桁数字）を壊さない
- ユーザー命名に番号を付与する
- 位置変更に追随する
- 多重 prefix を正規化する
- `max_number` を超えたら番号を出さない / 剥がす
- base が空の入力に触らない（`3:` を空ラベルにしない）
- **多重 prefix を繰り返し剥がす**（`2:3:review` → `3:review`）。単発置換の実装では落ちる
- **予約領域の不変条件を破る入力の挙動を固定する**（`1:30 standup` が `3:30 standup` になる）。これは望ましい挙動ではなく仕様上の代償なので、意図せず変わったら検知したい

書式を config 化したことで増えるケース:

- `tab_prefix = "[{n}] "` のような別書式でも、付与・剥がし・冪等性・多重剥がしが成立する
- `tabPrefixPattern` が書式のリテラル部分を正規表現エスケープする（`tab_prefix = "{n}."` が任意 1 文字にマッチしない）
- `max_number` を変えると番号を出す範囲が変わる

### 9.2 設定の読み込みと検証（`test/config.test.ts`）

- config.toml が無いとき既定値になる
- 一部のキーだけ書いたとき、残りが既定値で埋まる
- `tab_prefix` に `{n}` が無い設定を検証エラーにする。**これを通すと実行のたびにラベルが伸び続けるため、最も壊れ方が悪い入力**であり、単独のケースとして持つ価値がある
- `tab_prefix` / `workspace_token` に `{n}` が 2 個以上ある設定を検証エラーにする
- `workspace_token` に `{n}` が無い設定を検証エラーにする（全 workspace が同じ値になり目的が壊れる）
- `max_number` の 0 / 10 / 負数 / 非整数を検証エラーにする
- 空文字の `tab_prefix` / `workspace_token` を検証エラーにする

### 9.3 CLI 契約の統合テスト（`test/renumber.test.ts`）

`HERDR_BIN_PATH` に argv を記録するだけの偽 herdr を注入し、`bin/renumber.ts` が実際に発行するコマンド列を検証する。既存の herdr-plugin-sync が `test/fixtures/bin` で行っている PATH 注入と同じ考え方。

検証する契約:

- label を書き換える系のコマンド（`workspace rename`）を**一度も発行しないこと**。これは本プラグインの存在理由そのものなので、退行したら即座に落ちる必要がある
- トークン名が `jumpnum` であること（`num` に戻ると他プラグインと衝突しうる。3 節の検証で `--source` が分離しないことが分かっている）
- `number > max_number` の workspace に `--clear-token` を発行すること
- 既定ラベルの tab に `tab rename` を発行しないこと
- `tabs = false` のとき `tab rename` を一切発行しないこと
- `--reset` が `workspaces = false` / `tabs = false` でも両方を後始末すること
- 複数 workspace にまたがる tab 一覧を 1 回で処理すること（cross-workspace move の両側が更新される）

失敗経路:

- `workspace list` が失敗したとき、変更系コマンドを一切発行せず非 0 終了すること
- `tab list` が失敗したときも同様であること（片方だけの検証で満足しない）
- 個別の `tab rename` が失敗しても残りの tab を処理し、最後に非 0 終了すること
- 個別の `report-metadata` が失敗しても同様であること

### 9.4 manifest の契約テスト（`test/manifest.test.ts`）

`herdr-plugin.toml` をパースし、購読イベント集合が期待どおりであることを検証する。フックの取りこぼしは「番号がズレたまま更新されない」という気付きにくい壊れ方をするため、宣言自体をテストで固定する。

- `workspace.created` / `workspace.moved` / `workspace.closed` が含まれる
- `tab.created` / `tab.moved` / `tab.closed` / `tab.renamed` が含まれる
- **`workspace.metadata_updated` が含まれない**（含めると自分の `report-metadata` で無限ループする。理由をコメントで残す）

## 10. 実装構成

bun + TypeScript。ビルド工程を持たないので manifest に `[[build]]` は置かない。

```
herdr-jump-number/
├── herdr-plugin.toml
├── package.json
├── tsconfig.json
├── Makefile              # check: typecheck + test
├── README.md
├── config.example.toml
├── bin/renumber.ts
├── lib/config.ts
├── lib/naming.ts
├── lib/herdr.ts
├── lib/lock.ts
├── test/naming.test.ts
├── test/config.test.ts
├── test/renumber.test.ts
├── test/manifest.test.ts
└── docs/design.md
```

`platforms = ["linux", "macos"]`、`min_herdr_version = "0.7.5"`（検証したバージョン）。

### 既知のトレードオフ

bun を実行時依存として恒久化する。herdr-plugin-sync の設計では同じ理由で TypeScript を避け Rust を選んだ経緯があるため、複数マシンへ展開する際は各マシンに bun が必要になる点だけ引き継ぐ。既に gh-pr と herdr-wait が bun 依存で動いているため、この環境では新たな依存追加にはあたらない。

## 11. 移行手順

1. **先に herdr-pane-name を撤去する。** 同時稼働期間を作らない（両者が `tab.renamed` を購読し、異なる正規形へ書き換え合う last-writer-wins になるため）
   ```sh
   herdr plugin disable herdr.pane-name
   herdr plugin action invoke herdr.pane-name.reset   # disable 済みなので再付与されない
   herdr plugin uninstall herdr.pane-name
   ```
2. `herdr plugin link` で本プラグインを登録
3. `[ui.sidebar.spaces]` の `rows` に `$jumpnum` を追加する（例: `rows = [["state_icon", "$jumpnum", "workspace", "$pr"], ["branch", "git_status"]]`）して `herdr server reload-config`
4. **既存 workspace は label が pin 済みのため、作り直さないと cwd 追随が戻らない**（1 節の復旧不能な点を参照）

アンインストールや書式変更を行うときは、7.1 節の disable 経由の手順に従う。

## 12. 既知の制約

- **tab ラベル先頭の `tab_prefix` 形式は予約領域**（4.3 節の不変条件）。既定書式なら `1:30 standup` という名前が `30 standup` を base として扱われ、ユーザー入力の一部が不可逆に失われる。これは状態を持たない設計の代償であり、herdr-pane-name も同じ制約を持つ
- **tab ラベルには source namespace が無い**ため、同じ `tab_prefix` を使う別プラグインと同時稼働すると last-writer-wins の書き換え競争になる。検出・停止は実装しない（現時点で該当するのは herdr-pane-name だけで、移行手順で撤去するため）。将来別プラグインを入れるときは書式の衝突を利用者が確認する
- **workspace のトークン名はグローバル**（`--source` は分離しない、3 節で検証済み）。`jumpnum` という固有名で衝突確率を下げているが、同名を使う別プラグインとは共存できない
- 全桁数字のタブ名（例: `2024`）は herdr の既定ラベルと区別できないため、番号が付かない
- workspace の番号表示は利用者の `rows` 設定に依存する。プラグインは herdr の config.toml を書き換えない
- **`tab_prefix` の書式変更は自動移行されない。** 変更前に `reset` action を実行する必要がある。自動移行を実装しない判断根拠は、書式変更が初回セットアップ時に高々 1 回しか起きないイベントであり、旧書式を既知パターンとして列挙し続けるコストや、prefix の所有権を状態ファイルで持つ複雑さに見合わないため。後者は herdr-pane-name が `labels.json` で抱えた複雑さそのものであり、それを避けたのが本設計の売りである
