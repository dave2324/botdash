-- Add idempotency support for admin inbox replies
-- This prevents duplicate Telegram sends when the same request is retried.

ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Ensure a given conversation cannot have the same idempotency_key more than once.
-- Note: this covers both inbound/outbound, but the key is only used for outbound admin replies.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation_messages_conversation_id_idempotency_key
  ON conversation_messages(conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
