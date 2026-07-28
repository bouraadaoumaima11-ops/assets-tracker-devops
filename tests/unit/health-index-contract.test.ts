import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("health priceable-holding existence index", () => {
  it("indexes Holding.assetType in both schema and migration", () => {
    const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
    const holdingModel = schema.match(/model Holding \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(holdingModel).toContain("@@index([assetType])");

    const migration = readFileSync(
      resolve(root, "prisma/migrations/20260728000000_add_holding_asset_type_index/migration.sql"),
      "utf8",
    );
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "Holding_assetType_idx"');
  });
});
