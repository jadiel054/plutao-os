-- Adds role column to users table and marks jadielalves54@gmail.com as admin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user';
    END IF;
END $$;

UPDATE users SET role = 'admin' WHERE email = 'jadielalves54@gmail.com';
