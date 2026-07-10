-- ENH-1: idempotent profile expansion for existing installations.
-- The runner skips individual duplicate-column statements, so this works for both
-- legacy core schemas and databases already created from the enhanced demo schema.
ALTER TABLE users ADD COLUMN employee_id VARCHAR(20);
ALTER TABLE users ADD COLUMN phone VARCHAR(30);
ALTER TABLE users ADD COLUMN personal_address TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN office_branch VARCHAR(100);
ALTER TABLE users ADD COLUMN office_city VARCHAR(80);
ALTER TABLE users ADD COLUMN office_country VARCHAR(80);
ALTER TABLE users ADD COLUMN company_name VARCHAR(200);
ALTER TABLE users ADD COLUMN company_address TEXT;
ALTER TABLE users ADD COLUMN job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN join_date DATE;
ALTER TABLE users ADD COLUMN gender VARCHAR(10) CHECK (gender IN ('male','female','other','prefer_not_to_say'));
ALTER TABLE users ADD COLUMN notify_email BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_whatsapp BOOLEAN DEFAULT TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id_unique ON users(employee_id);
UPDATE users SET address = personal_address WHERE address IS NULL;
