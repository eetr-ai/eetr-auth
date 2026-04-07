-- Add optional human-readable name to OAuth clients for admin UX.
ALTER TABLE clients ADD COLUMN name TEXT;
