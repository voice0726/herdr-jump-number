#!/usr/bin/env bun
import { withLock } from "../../lib/lock";

const path = process.env.TEST_LOCK_PATH;
if (!path) throw new Error("TEST_LOCK_PATH is required");

const holdMs = Number(process.env.TEST_HOLD_MS ?? "0");
withLock(
  () => {
    Bun.sleepSync(holdMs);
  },
  { path },
);
