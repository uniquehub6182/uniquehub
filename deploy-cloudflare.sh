#!/bin/bash
echo "🔨 Building UniqueHub..."
npx vite build

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

echo "🚀 Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=uniquehub --branch=main

echo "✅ Deploy complete! Available at https://uniquehub.pages.dev"
