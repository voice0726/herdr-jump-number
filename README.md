# herdr-jump-number

herdr の jump key に対応する番号を、workspace ラベルを rename せずに表示するプラグインです。

## なぜ rename しないのか

herdr は `workspace.rename` を一度でも呼ぶと、その workspace のラベルを手動ラベルとして
固定し、cwd からの自動命名を恒久的に停止します。空文字 rename でも復旧せず、workspace を
作り直す以外に戻す手段がありません。

本プラグインは workspace には表示専用の `report-metadata` トークンだけを使い、label に
触れません。詳細は `docs/design.md` を参照してください。

## インストール

```sh
herdr plugin link .
```

`~/.config/herdr/config.toml` の `[ui.sidebar.spaces]` に `$jumpnum` を追加します。

```toml
rows = [["state_icon", "$jumpnum", "workspace"], ["branch", "git_status"]]
```

```sh
herdr server reload-config
```

## 設定

`herdr plugin config-dir voice0726.jump-number` が表示するディレクトリに
`config.toml` を置きます。設定項目は `config.example.toml` を参照してください。

## アンインストール / 書式変更

**必ず disable してから reset してください。** reset の tab rename が `tab.renamed` を発火し、
それを購読した通常の同期が prefix を付け直してしまうためです。

```sh
herdr plugin disable voice0726.jump-number
bun bin/renumber.ts --reset
# ここで uninstall するか、config.toml の書式を変更する
```

## 既知の制約

- tab ラベル先頭の `tab_prefix` 形式はプラグインの予約領域です。既定書式で `1:30 standup` の
  ような名前を付けると、`1:` が prefix と誤認され `30 standup` が base として扱われます。
- 全桁数字の tab 名（例 `2024`）は herdr の既定ラベルと区別できないため番号が付きません。
- workspace のトークン名はグローバルです。同名 `jumpnum` を使う別プラグインとは共存できません。

## 開発

```sh
make check   # typecheck + bun test
```
