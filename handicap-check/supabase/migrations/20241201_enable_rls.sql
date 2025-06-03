-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE golfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tee_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE excluded_dates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "Approved users can view golfers" ON golfers;
DROP POLICY IF EXISTS "Approved users can manage golfers" ON golfers;
DROP POLICY IF EXISTS "Approved users can view tee times" ON tee_times;
DROP POLICY IF EXISTS "Approved users can manage tee times" ON tee_times;
DROP POLICY IF EXISTS "Approved users can view excluded dates" ON excluded_dates;
DROP POLICY IF EXISTS "Admins can manage excluded dates" ON excluded_dates;

-- Users table policies
-- Users can view their own data
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT 
  USING (auth.uid()::text = id::text);

-- Users can update their own data (but not admin status or approval status)
CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE 
  USING (auth.uid()::text = id::text);

-- Admins can view all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_admin = true 
      AND is_approved = true
    )
  );

-- Only admins can manage user approval and admin status
CREATE POLICY "Admins can manage users" ON users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_admin = true 
      AND is_approved = true
    )
  );

-- Golfers table policies
-- Approved committee members can view all golfers
CREATE POLICY "Approved users can view golfers" ON golfers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  );

-- Approved committee members can manage golfers
CREATE POLICY "Approved users can manage golfers" ON golfers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  );

-- Tee times table policies
-- Approved committee members can view all tee times
CREATE POLICY "Approved users can view tee times" ON tee_times
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  );

-- Approved committee members can manage tee times (including posting status)
CREATE POLICY "Approved users can manage tee times" ON tee_times
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  );

-- Excluded dates table policies
-- Approved committee members can view excluded dates
CREATE POLICY "Approved users can view excluded dates" ON excluded_dates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  );

-- Approved committee members can manage excluded dates
CREATE POLICY "Approved users can manage excluded dates" ON excluded_dates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id::text = auth.uid()::text 
      AND is_approved = true
    )
  ); 