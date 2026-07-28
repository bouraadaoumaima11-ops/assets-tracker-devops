-- Supports the empty-PriceCache health probe's priceable-holding existence query.
CREATE INDEX IF NOT EXISTS "Holding_assetType_idx" ON "Holding" ("assetType");
