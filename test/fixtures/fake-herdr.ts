#!/usr/bin/env bun
// テスト用の偽 herdr。argv を FAKE_HERDR_LOG に追記し、
// FAKE_HERDR_WORKSPACES / FAKE_HERDR_PANES / FAKE_HERDR_TABS の内容を応答として返す。
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
} else if (key === "pane list") {
  process.stdout.write(
    JSON.stringify({
      id: "fake",
      result: { panes: JSON.parse(process.env.FAKE_HERDR_PANES ?? "[]") },
    }),
  );
} else if (key === "workspace report-metadata") {
  // 実測値（herdr workspace report-metadata w2J --source diag --token diag=x）:
  // exit=0、stdout の長さ=0。clear-token も同じ成功応答になる。
  // 比較として herdr tab rename w2J:t2 "2:review" は stdout の長さ=185 の JSON。
  process.stdout.write("");
} else {
  process.stdout.write(JSON.stringify({ id: "fake", result: { type: "ok" } }));
}
