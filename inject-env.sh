#!/usr/bin/env bash
set -euo pipefail

sed -i "
  s|apiKey: \"YOUR_FIREBASE_API_KEY\"|apiKey: \"${FIREBASE_API_KEY}\"|;
  s|apiKey: \"YOUR_API_KEY\"|apiKey: \"${FIREBASE_API_KEY}\"|;
  s|authDomain: \"YOUR_FIREBASE_AUTH_DOMAIN\"|authDomain: \"${FIREBASE_AUTH_DOMAIN}\"|;
  s|authDomain: \"YOUR_AUTH_DOMAIN\"|authDomain: \"${FIREBASE_AUTH_DOMAIN}\"|;
  s|projectId: \"YOUR_FIREBASE_PROJECT_ID\"|projectId: \"${FIREBASE_PROJECT_ID}\"|;
  s|projectId: \"YOUR_PROJECT_ID\"|projectId: \"${FIREBASE_PROJECT_ID}\"|;
  s|storageBucket: \"YOUR_FIREBASE_STORAGE_BUCKET\"|storageBucket: \"${FIREBASE_STORAGE_BUCKET}\"|;
  s|storageBucket: \"YOUR_STORAGE_BUCKET\"|storageBucket: \"${FIREBASE_STORAGE_BUCKET}\"|;
  s|messagingSenderId: \"YOUR_FIREBASE_MESSAGING_SENDER_ID\"|messagingSenderId: \"${FIREBASE_MESSAGING_SENDER_ID}\"|;
  s|messagingSenderId: \"YOUR_MESSAGING_SENDER_ID\"|messagingSenderId: \"${FIREBASE_MESSAGING_SENDER_ID}\"|;
  s|appId: \"YOUR_FIREBASE_APP_ID\"|appId: \"${FIREBASE_APP_ID}\"|;
  s|appId: \"YOUR_APP_ID\"|appId: \"${FIREBASE_APP_ID}\"|;
  s|const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'|const GEMINI_API_KEY = '${GEMINI_API_KEY}'|;
" public/index.html
