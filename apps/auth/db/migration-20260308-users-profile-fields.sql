-- Add optional profile fields for users.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN avatar_key TEXT;
