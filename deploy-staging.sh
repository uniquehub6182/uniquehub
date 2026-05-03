#!/bin/bash
echo "🔨 Building UniqueHub (staging)..."
env NODE_ENV=development npx vite build

echo "📄 Adding Cloudflare Pages config..."
cat > dist/_redirects << 'EOF'
/*  /index.html  200
EOF

cat > dist/_headers << 'EOF'
/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
EOF

echo "🚀 Deploying to Cloudflare Pages (STAGING)..."
npx wrangler pages deploy dist --project-name=uniquehub --branch=staging

echo "✅ Staging deploy complete!"
echo "📎 Preview: https://staging.uniquehub.pages.dev"
echo "📎 Beta:    https://beta.uniquehub.com.br (após configurar DNS)"
