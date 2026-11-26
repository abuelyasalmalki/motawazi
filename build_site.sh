#!/usr/bin/env bash
# ============================================================
# متوازي · بناء مجلّد النشر (dist) بقائمة سماح
# ============================================================
# الاستضافة تنشر dist/ فقط — لا المستودع كاملًا (انظر STACK.md).
# المبدأ: «امنع كل شيء إلا المسموح». فلا تصل functions/ ولا القواعد
# ولا ملفات الإعداد إلى الاستضافة أبدًا.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/dist"

rm -rf "$OUT"
mkdir -p "$OUT"

# قائمة السماح: صفحات الواجهة وسكربتاتها فقط.
PUBLIC_FILES=(
  index.html
  login.html
  account.html
  plan.html
  track.html
  start.html
  summary.html
  stories.html
  terms.html
  privacy.html
  404.html
  style.css
  firebase-config.js
  auth.js
  start.js
  manifest.json
  apple-touch-icon.png
  icon-192.png
  icon-512.png
  og-image.jpg
  workouts.json
  meals.json
  robots.txt
  favicon.svg
)

for f in "${PUBLIC_FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$OUT/$f"
  else
    echo "خطأ: ملف الواجهة غير موجود: $f" >&2
    exit 1
  fi
done

# إعداد الاستمارة والوجبات والتمارين: نفس الملفات اللي يقرؤها الخادم والجدول
mkdir -p "$OUT/config"
cp "$ROOT/functions/nutrition.config.json" "$OUT/config/nutrition.json"
cp "$ROOT/functions/countries.json"        "$OUT/config/countries.json"
cp "$ROOT/functions/meals.sa.json"         "$OUT/config/meals.json"
cp "$ROOT/config/workouts.json"            "$OUT/config/workouts.json"

# أصول ثابتة عامّة وصور وفيديوهات التمارين
[ -d "$ROOT/assets" ] && cp -R "$ROOT/assets" "$OUT/assets"
[ -d "$ROOT/img" ]    && cp -R "$ROOT/img"    "$OUT/img"

# حارس أمان: لا يتسرّب إلى dist ما ليس واجهة.
for forbidden in functions tests .github firestore.rules firebase.json .firebaserc \
                 CLAUDE.md STACK.md build_site.sh; do
  if [ -e "$OUT/$forbidden" ]; then
    echo "خطأ: تسرّب ملف محظور إلى dist/$forbidden — أُلغي البناء." >&2
    exit 1
  fi
done

echo "✅ تم بناء dist/:"
ls -1 "$OUT"
