-- Ajuste de desempenho da sincronização PNCP (requisições paralelas com taxa controlada)
UPDATE ata_sources SET config = config || '{"request_interval_ms": 250, "concurrency": 4, "max_items_per_procurement": 80}'::jsonb WHERE code = 'pncp';
CREATE INDEX IF NOT EXISTS idx_sync_job ON synchronization_logs(job, started_at DESC);
