-- 001_init.sql

-- UUIDs + json crypto helpers (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- =========================
-- Core append-only event log
-- =========================
CREATE TABLE IF NOT EXISTS inventory_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         text NOT NULL,                           -- support multi-tenant later
  variant_id      text NOT NULL,                           -- Shopify Variant GID
  location_id     text,                                    -- Shopify Location GID (nullable)
  event_type      text NOT NULL,                           -- 'sale','return','restock','adjustment','transfer_in','transfer_out','fulfillment_commit','fulfillment_release'
  quantity_delta  integer NOT NULL,                        -- +inbound, -outbound
  event_ts        timestamptz NOT NULL,                    -- when it happened (from Shopify)
  source_ref      text,                                    -- order/fulfillment/transfer/webhook id
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,      -- raw payload / reason codes
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_delta <> 0),
  CHECK (event_type IN (
    'sale','return','restock','adjustment','transfer_in','transfer_out',
    'fulfillment_commit','fulfillment_release'
  ))
);

-- Query accelerators
CREATE INDEX IF NOT EXISTS ie_variant_time_desc
  ON inventory_events (variant_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS ie_variant_loc_time_desc
  ON inventory_events (variant_id, location_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS ie_shop_variant_time
  ON inventory_events (shop_id, variant_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS ie_event_type_time
  ON inventory_events (event_type, event_ts DESC);

-- =========================
-- JIT knobs (per SKU, optional per location)
-- =========================
CREATE TABLE IF NOT EXISTS sku_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         text NOT NULL,
  variant_id      text NOT NULL,
  location_id     text,                   -- NULL => global setting for the SKU
  lead_time_days  integer NOT NULL CHECK (lead_time_days >= 0),
  safety_stock    integer NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  pack_size       integer NOT NULL DEFAULT 1 CHECK (pack_size >= 1),
  min_order_qty   integer NOT NULL DEFAULT 0 CHECK (min_order_qty >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness rules:
--  - Only one global row per (shop, variant) when location_id IS NULL
--  - Only one localized row per (shop, variant, location) when location_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS sku_settings_unique_global
  ON sku_settings (shop_id, variant_id)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sku_settings_unique_local
  ON sku_settings (shop_id, variant_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sku_settings_lookup
  ON sku_settings (shop_id, variant_id, COALESCE(location_id, 'GLOBAL'));

-- =========================
-- Open inbound (POs / transfers)
-- =========================
CREATE TABLE IF NOT EXISTS inbound_shipments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       text NOT NULL,
  variant_id    text NOT NULL,
  location_id   text NOT NULL,
  quantity      integer NOT NULL CHECK (quantity > 0),
  expected_date date NOT NULL,
  status        text NOT NULL DEFAULT 'open',              -- open | received | cancelled
  source_ref    text,                                      -- PO/transfer id
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open','received','cancelled'))
);

CREATE INDEX IF NOT EXISTS inbound_lookup
  ON inbound_shipments (shop_id, variant_id, status, expected_date);

-- =========================
-- Helper views for fast reads
-- =========================

-- Current on-hand by summing signed deltas
CREATE OR REPLACE VIEW v_on_hand AS
SELECT
  shop_id,
  variant_id,
  location_id,
  SUM(quantity_delta) AS on_hand
FROM inventory_events
GROUP BY shop_id, variant_id, location_id;

-- 30-day simple demand velocity (avg daily outbound units)
CREATE OR REPLACE VIEW v_daily_velocity_30d AS
WITH outs AS (
  SELECT shop_id, variant_id, location_id, -quantity_delta AS qty_out
  FROM inventory_events
  WHERE event_type IN ('sale','fulfillment_commit')
    AND event_ts >= now() - interval '30 days'
)
SELECT
  shop_id,
  variant_id,
  location_id,
  COALESCE(SUM(qty_out), 0)::numeric / 30.0 AS daily_velocity
FROM outs
GROUP BY shop_id, variant_id, location_id;

COMMIT;

-- Optional notes:
-- - If you need “as-of” inventory at time T, query inventory_events with event_ts <= T and sum.
-- - If you decide to treat commitments as temporary negatives, insert 'fulfillment_commit' (−)
--   on reserve and 'fulfillment_release' (+) on release/ship/cancel so v_on_hand reflects reservations.
