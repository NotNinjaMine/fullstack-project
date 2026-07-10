-- ENH: Optional Telegram notifications
-- Nullable so existing users are unaffected.
-- Idempotent when applied via migrate.js (column existence is checked first).

ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(64);
