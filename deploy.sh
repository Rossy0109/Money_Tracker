#!/bin/bash
echo "🚀 Deploy শুরু হচ্ছে..."

# Memory fix
export NODE_OPTIONS="--max-old-space-size=512"

# Build
echo "📦 Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

# GitHub push
echo "📤 GitHub push করছি..."
git add .
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
git push origin main

# Vercel deploy
echo "▲ Vercel deploy করছি..."
vercel --prod

# Firebase deploy
echo "🔥 Firebase deploy করছি..."
firebase deploy --only hosting

echo "✅ Deploy সম্পন্ন!"
