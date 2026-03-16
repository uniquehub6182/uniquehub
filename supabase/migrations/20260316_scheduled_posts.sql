CREATE TABLE IF NOT EXISTS scheduled_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  media_type text NOT NULL DEFAULT 'FEED',
  image_urls jsonb NOT NULL DEFAULT '[]',
  caption text DEFAULT '',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  error text,
  result jsonb,
  demand_id text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status, scheduled_at);
