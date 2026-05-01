-- 1. Create GIN index for fast search
CREATE INDEX IF NOT EXISTS idx_emails_search_gin ON emails USING GIN(search_vector);

-- 2. Create trigger function to auto-update search vector
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.subject,'') || ' ' || 
    COALESCE(NEW.snippet,'') || ' ' || 
    COALESCE(NEW.sender,'') || ' ' ||
    COALESCE(NEW.sender_name,'')
  );
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 3. Attach trigger to emails table
DROP TRIGGER IF EXISTS emails_search_trigger ON emails;
CREATE TRIGGER emails_search_trigger BEFORE INSERT OR UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- 4. Perform initial population for existing records
UPDATE emails SET search_vector = to_tsvector('english',
  COALESCE(subject,'') || ' ' || 
  COALESCE(snippet,'') || ' ' || 
  COALESCE(sender,'') || ' ' ||
  COALESCE(sender_name,'')
) WHERE search_vector IS NULL;
