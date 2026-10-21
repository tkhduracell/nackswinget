import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { snapshotSchema } from "@/lib/content/types";

describe("CI fixture snapshot", () => {
  it("matches the content schema", () => {
    const raw = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "snapshot.json"), "utf8"));
    expect(() => snapshotSchema.parse(raw)).not.toThrow();
  });
});
