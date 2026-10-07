#!/bin/bash
# =============================================================================
# Script Deployment Frontend Dojang ke AWS S3 dengan Konfigurasi Header SW Aman
# =============================================================================

set -e

# Nama Bucket S3 (sesuaikan dengan AWS environment Anda)
BUCKET_CORE="s3://dojang-core-prod"
BUCKET_TURNPRO="s3://dojang-turnpro-prod"
BUCKET_COACH="s3://dojang-coach-prod"
BUCKET_MEMBER="s3://dojang-member-prod"

echo "=== 1. Deploy Dojang Core (Root /) ==="
# Upload semua aset dengan cache standar (misal 1 tahun untuk aset ber-hash)
aws s3 sync ./client/public $BUCKET_CORE \
  --exclude "turn-pro/*" \
  --exclude "coach/*" \
  --exclude "member/*" \
  --exclude "sw.js" \
  --delete

# WAJIB: Upload sw.js Core dengan Cache-Control no-cache
aws s3 cp ./client/public/sw.js $BUCKET_CORE/sw.js \
  --content-type "application/javascript" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --metadata-directive REPLACE

echo "=== 2. Deploy Dojang Turn Pro (/turn-pro/) ==="
# Upload aset pertandingan Turn Pro
aws s3 sync ./client/public/turn-pro $BUCKET_TURNPRO \
  --exclude "sw.js" \
  --delete

# WAJIB: Upload sw.js Turn Pro dengan no-cache
aws s3 cp ./client/public/turn-pro/sw.js $BUCKET_TURNPRO/sw.js \
  --content-type "application/javascript" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --metadata-directive REPLACE

echo "=== 3. Invalidate Cache CloudFront (Agar update langsung live) ==="
# aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

echo "Deploy S3 selesai dengan header Service Worker yang aman!"
