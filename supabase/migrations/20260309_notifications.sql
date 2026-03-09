-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL, -- post_created, post_approved, post_rejected, demand_created, demand_updated, member_joined, member_approved, calendar_reminder, checkin, system
  title text NOT NULL,
  body text,
  icon text, -- emoji
  link text, -- deep link within app (e.g. "demands:123", "news:456")
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- Disable RLS for simplicity (internal app)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
