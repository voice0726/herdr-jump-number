# herdr-jump-number

[日本語訳](#日本語訳)

`herdr-jump-number` is a Herdr plugin that displays jump-key numbers on
workspaces and tabs without breaking Herdr's automatic workspace labels.

## Features

- Workspaces display `[1]` through `[9]` through the `$jumpnum` sidebar token.
  Workspace labels are never renamed.
- User-named tabs receive a prefix such as `2:review`.
- Herdr's default numeric tab labels, such as `1` and `2`, are left unchanged.
- Workspace and tab changes are synchronized through Herdr lifecycle events.
- The configuration is read on every synchronization, so a Herdr restart is
  not required after changing the plugin configuration.

## Requirements

- Herdr `0.7.5` or later
- Bun `1.3` or later available as `bun` on `PATH`

The plugin runs the TypeScript source directly and has no runtime npm
dependencies. You do not need to run `bun install` for a normal installation.

## Quick start

### 1. Install the plugin

For a normal installation, install the GitHub repository with Herdr's managed plugin installer:

```sh
herdr plugin install voice0726/herdr-jump-number
```

Confirm that the plugin is enabled:

```sh
herdr plugin list
```

You should see `voice0726.jump-number` in the list. If it is listed as
disabled, enable it explicitly:

```sh
herdr plugin enable voice0726.jump-number
```

### Local checkout

Use `plugin link` when you want to run a local clone while developing or testing the plugin:

```sh
git clone https://github.com/voice0726/herdr-jump-number.git
cd herdr-jump-number
herdr plugin link "$PWD"
```

If you already have this repository checked out, run only:

```sh
herdr plugin link "$PWD"
```

### 2. Add `$jumpnum` to the workspace sidebar

Open `~/.config/herdr/config.toml` and add `$jumpnum` to the existing
`[ui.sidebar.spaces]` `rows` setting. For example:

```toml
[ui.sidebar.spaces]
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

If `[ui.sidebar.spaces]` or `rows` already exists, edit that setting instead
of adding a duplicate TOML table. Keep any sidebar tokens that you already
use.

Reload Herdr's configuration:

```sh
herdr server reload-config
```

The reload should report `status: applied` without diagnostics.

### 3. Immediate synchronization

The plugin normally runs automatically when workspaces or tabs change. To apply the numbers immediately, invoke the global sync action:

```sh
herdr plugin action invoke sync --plugin voice0726.jump-number
```

You can inspect the resulting metadata and tab labels with:

```sh
herdr workspace list
herdr tab list
```

Workspace entries should contain a `jumpnum` token, while their `label` values should remain unchanged.

## Plugin configuration

The defaults are suitable for most users. To override them, create `config.toml`
in the directory printed by this command. `herdr plugin config-dir` creates the
directory when necessary:

```sh
herdr plugin config-dir voice0726.jump-number
```

Use the following as the initial contents of `<config-dir>/config.toml`:

```toml
workspaces = true
tabs = true
workspace_token = "[{n}]"
tab_prefix = "{n}:"
max_number = 9
```

Edit that file as needed:

| Setting | Default | Description |
| --- | --- | --- |
| `workspaces` | `true` | Show numbers on workspaces. |
| `tabs` | `true` | Add numbers to user-named tabs. |
| `workspace_token` | `"[{n}]"` | Format for the workspace sidebar token. |
| `tab_prefix` | `"{n}:"` | Prefix format for user-named tabs. |
| `max_number` | `9` | Highest number to display. Must be between `1` and `9`. |

Both `workspace_token` and `tab_prefix` must contain `{n}` exactly once. After editing the file, run the sync action again if you want to see the change immediately; a Herdr restart is not necessary.

## Display style

The default workspace number format is controlled by `workspace_token`:

```toml
workspace_token = "[{n}]"  # [3]
```

For example, `workspace_token = "{n}"` displays `3`, and `workspace_token = "({n})"` displays `(3)`. The placeholder `{n}` must still appear exactly once.

Herdr automatically inserts `·` between adjacent non-empty tokens in the same sidebar row. Therefore, with a row such as:

```toml
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

`[3] · herdr-jump-number` is expected. The separator is provided by Herdr's sidebar renderer; it is not controlled by `workspace_token` or token styling. To remove the separator, put the number and workspace on separate rows:

```toml
rows = [["state_icon", "$jumpnum"], ["workspace"], ["branch", "git_status"]]
```

This displays the number and workspace on separate lines. The documented sidebar layout currently does not provide a custom literal separator for tokens on the same row.

## How it works

Workspace labels are special in Herdr: calling `workspace rename` can pin a
label and stop it from following the current directory. This plugin therefore
uses a display-only workspace metadata token named `jumpnum` and never calls
`workspace rename`.

Tabs do not have the same metadata display mechanism, so the plugin prefixes
user-named tabs. Numeric default labels are not changed.

## Reset, uninstall, or change the format

Always disable the plugin before resetting its existing numbers. Otherwise,
the tab rename performed by reset can trigger a synchronization event that
adds the prefix again.

The reset command below assumes a local checkout. For a GitHub-managed install,
run it from the `plugin_root` shown by `herdr plugin list --json` while the
plugin is still installed.

```sh
herdr plugin disable voice0726.jump-number
bun bin/renumber.ts --reset
```

### Change the format

To change `tab_prefix` or `workspace_token`, disable and reset the plugin
using the commands above. Then edit the plugin `config.toml`, enable the plugin,
and run the sync action. Keep `$jumpnum` in the Herdr sidebar configuration.

```sh
herdr plugin enable voice0726.jump-number
herdr plugin action invoke sync --plugin voice0726.jump-number
```

### Uninstall

To uninstall the plugin, disable and reset it using the commands above. Then
remove `$jumpnum` from the Herdr sidebar configuration and reload it:

```sh
herdr server reload-config
```

For a locally linked plugin, unlink it with:

```sh
herdr plugin unlink voice0726.jump-number
```

For a GitHub-managed installation, uninstall it after the reset:

```sh
herdr plugin uninstall voice0726.jump-number
```


## Troubleshooting and limitations

- **No number appears in the sidebar:** confirm that the plugin is enabled and
  that `$jumpnum` is present in `[ui.sidebar.spaces].rows`, then reload the
  Herdr configuration and run the sync action.
- **An existing workspace label does not follow `cd`:** this plugin does not
  rename workspace labels, but it cannot undo a label that another plugin or a
  manual command has already pinned. Recreate that workspace to restore Herdr's
  automatic label behavior.
- **Do not use the default prefix as part of a tab name.** With
  `tab_prefix = "{n}:"`, a name such as `1:30 standup` is interpreted as an
  existing plugin prefix. Use a different name or change the prefix format
  before creating such tabs.
- A tab whose label is all digits, such as `2024`, is indistinguishable from a
  Herdr default label and is left unchanged.
- The `jumpnum` workspace token is global in Herdr. Another plugin using the
  same token name cannot safely coexist with this plugin.

## Development

Install development dependencies and run the standard checks:

```sh
bun install
make check
```

`make check` runs TypeScript type checking and the Bun test suite.

---

## 日本語訳

`herdr-jump-number` は、Herdr の workspace 自動ラベルを壊さずに、workspace と tab に
ジャンプキーの番号を表示する Herdr プラグインです。

### できること

- workspace のサイドバーに `$jumpnum` を使って `[1]`〜`[9]` を表示します。workspace の
  ラベル自体は rename しません。
- ユーザーが名前を付けた tab に `2:review` のような prefix を付けます。
- `1` や `2` のような Herdr の既定の数字 tab ラベルは変更しません。
- workspace / tab のライフサイクルイベントに応じて自動同期します。
- 設定は同期のたびに読み直すため、plugin 設定の変更後に Herdr を再起動する必要は
  ありません。

### 必要なもの

- Herdr `0.7.5` 以上
- `PATH` から `bun` として実行できる Bun `1.3` 以上

この plugin は TypeScript のソースを直接実行し、実行時の npm 依存はありません。通常のインストールでは `bun install` は不要です。

### クイックスタート

#### 1. plugin をインストールする

通常のインストールでは、Herdr の管理対象として GitHub repository をインストールします。

```sh
herdr plugin install voice0726/herdr-jump-number
```

plugin が有効になっていることを確認します。

```sh
herdr plugin list
```

一覧に `voice0726.jump-number` が表示されます。`disabled` と表示された場合は、明示的に
有効化します。

```sh
herdr plugin enable voice0726.jump-number
```

#### local checkout

local clone を使う場合は `plugin link` を実行します。

```sh
git clone https://github.com/voice0726/herdr-jump-number.git
cd herdr-jump-number
herdr plugin link "$PWD"
```

#### 2. workspace サイドバーに `$jumpnum` を追加する

`~/.config/herdr/config.toml` を開き、既存の `[ui.sidebar.spaces]` の `rows` に `$jumpnum` を追加します。例:

```toml
[ui.sidebar.spaces]
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

すでに `[ui.sidebar.spaces]` や `rows` がある場合は、TOML の table を重複して追加せず、既存の設定に `$jumpnum` を追加してください。現在使っている他の sidebar token は残します。

Herdr の設定を再読み込みします。

```sh
herdr server reload-config
```

`status: applied` になり、diagnostics が空であれば成功です。

#### 3. 即時同期

workspace や tab の変更時には自動実行されます。番号を即時反映する場合は、global sync action を実行します。

```sh
herdr plugin action invoke sync --plugin voice0726.jump-number
```

反映結果は次のコマンドで確認できます。

```sh
herdr workspace list
herdr tab list
```

workspace に `jumpnum` token が付き、workspace の `label` は変わっていないことを確認します。

### plugin の設定

既定値で使用できます。変更する場合は、次のコマンドが表示するディレクトリに
`config.toml` を作成します。`herdr plugin config-dir` は必要なディレクトリを作成します。

```sh
herdr plugin config-dir voice0726.jump-number
```

`<config-dir>/config.toml` の初期内容は次のとおりです。

```toml
workspaces = true
tabs = true
workspace_token = "[{n}]"
tab_prefix = "{n}:"
max_number = 9
```

このファイルを必要に応じて編集します。

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `workspaces` | `true` | workspace に番号を表示します。 |
| `tabs` | `true` | 名前付き tab に番号を付けます。 |
| `workspace_token` | `"[{n}]"` | workspace sidebar token の書式です。 |
| `tab_prefix` | `"{n}:"` | 名前付き tab の prefix 書式です。 |
| `max_number` | `9` | 表示する最大番号です。`1`〜`9` の範囲で指定します。 |

`workspace_token` と `tab_prefix` には `{n}` をそれぞれちょうど 1 個含める必要があります。編集後すぐに反映する場合は sync action を再度実行してください。Herdr の再起動は不要です。

### 表示スタイル

workspace 番号の既定の書式は `workspace_token` で変更できます。

```toml
workspace_token = "[{n}]"  # [3]
```

たとえば `workspace_token = "{n}"` なら `3`、`workspace_token = "({n})"` なら `(3)` と表示されます。`{n}` は引き続きちょうど 1 個必要です。

Herdr は同じ sidebar row 内の空でない token の間に `·` を自動挿入します。そのため、次のような row では:

```toml
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

`[3] · herdr-jump-number` になるのが正常です。この区切りは Herdr の sidebar renderer が出しており、`workspace_token` や token の style では変更できません。中黒をなくしたい場合は、番号と workspace を別の row に分けます。

```toml
rows = [["state_icon", "$jumpnum"], ["workspace"], ["branch", "git_status"]]
```

この場合、番号と workspace は別行に表示されます。現在の Herdr の documented sidebar layout には、同じ row の token 間に任意の文字列 separator を指定する設定はありません。

### 動作の仕組み

Herdr の workspace label は、`workspace rename` を呼ぶと固定され、現在の directory に追随
しなくなることがあります。そのため、この plugin は表示専用の workspace metadata token
`jumpnum` を使い、`workspace rename` を一切呼びません。

tab には同じ metadata 表示機構がないため、ユーザーが名前を付けた tab に prefix を付けます。
数字だけの既定ラベルは変更しません。

### reset・アンインストール・書式変更

既存の番号を reset するときは、必ず先に plugin を disable してください。そうしないと、
reset が行う tab rename から同期イベントが発生し、prefix が再び付くことがあります。

以下の reset 手順は local checkout を前提にしています。GitHub 管理インストールの場合は、
plugin がまだインストールされている間に `herdr plugin list --json` で `plugin_root` を確認し、
そのディレクトリから同じ reset を実行してください。

```sh
herdr plugin disable voice0726.jump-number
bun bin/renumber.ts --reset
```

#### 書式変更

`tab_prefix` または `workspace_token` を変更する場合は、上記の手順で plugin を disable
して reset します。その後、plugin の `config.toml` を編集し、plugin を enable して sync
action を実行します。Herdr の sidebar 設定にある `$jumpnum` は残します。

```sh
herdr plugin enable voice0726.jump-number
herdr plugin action invoke sync --plugin voice0726.jump-number
```

#### アンインストール

plugin をアンインストールする場合は、上記の手順で disable と reset を行った後に、Herdr の
sidebar 設定から `$jumpnum` を削除して再読み込みします。

```sh
herdr server reload-config
```

local link を解除する場合は次を実行します。

```sh
herdr plugin unlink voice0726.jump-number
```

GitHub 管理インストールを削除する場合は、reset 後に次を実行します。

```sh
herdr plugin uninstall voice0726.jump-number
```


### トラブルシューティングと制約

- **sidebar に番号が出ない:** plugin が有効か、`[ui.sidebar.spaces].rows` に `$jumpnum` が
  あるかを確認し、Herdr の設定を再読み込みして sync action を実行してください。
- **既存 workspace の label が `cd` に追随しない:** この plugin は label を rename しませんが、
  他の plugin や手動コマンドによってすでに固定された label を元に戻すことはできません。
  Herdr の自動ラベルに戻すには workspace を作り直してください。
- **既定の prefix を tab 名の一部に使わない:** `tab_prefix = "{n}:"` の場合、`1:30 standup`
  のような名前は既存の plugin prefix と解釈されます。そのような tab を作る場合は別の名前を
  使うか、先に prefix の書式を変更してください。
- `2024` のような数字だけの tab 名は Herdr の既定ラベルと区別できないため変更しません。
- `jumpnum` workspace token は Herdr 内でグローバルです。同じ token 名を使う別 plugin とは安全に
  共存できません。

### 開発

開発用の依存をインストールし、標準チェックを実行します。

```sh
bun install
make check
```

`make check` は TypeScript の型チェックと Bun のテストスイートを実行します。
