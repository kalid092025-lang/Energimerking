CREATE INDEX IF NOT EXISTS idx_denorm_oslo_tile_bounds
ON denorm_matrikkel_og_enova_oslo (lat, lon, id)
WHERE "kommuneNr" IS NOT NULL
  AND coordinate IS NOT NULL
  AND lat IS NOT NULL
  AND lon IS NOT NULL;
