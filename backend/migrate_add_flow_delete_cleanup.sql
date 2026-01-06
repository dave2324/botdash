-- Cleanup helper indexes for flow deletion safety (no-op if already present)

-- If flow_sessions exists, ensure index on flow_id for fast cleanup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='flow_sessions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow_id ON flow_sessions(flow_id)';
  END IF;
END $$;
