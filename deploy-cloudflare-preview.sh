#!/bin/bash
# Deploy de preview branches no Cloudflare Pages
# URL fica: https://<branch-name>.uniquehub.pages.dev

BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
  echo "❌ Use deploy-cloudflare.sh pra main."
  exit 1
fi

echo "🔨 Building UniqueHub (branch: $BRANCH)..."
npx vite build

echo "📄 Adding Cloudflare Pages config..."
cat > dist/_redirects << 'REDIR'
/*  /index.html  200
REDIR

cat > dist/_headers << 'HEADERS'
/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()
HEADERS

echo "🚀 Deploying preview to Cloudflare Pages (branch=$BRANCH)..."
npx wrangler pages deploy dist --project-name=uniquehub --branch="$BRANCH"

echo ""
echo "✅ Deploy complete!"
echo "🔗 Branch URL: https://${BRANCH}.uniquehub.pages.dev"
echo "🔗 Production: https://uniquehub.pages.dev (intacta)"
