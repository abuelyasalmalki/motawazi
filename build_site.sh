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
  start.html
  summary.html
  terms.html
  privacy.html
  404.html
  style.css
  firebase-config.js
  auth.js
  start.js
  robots.txt
)

for f in "${PUBLIC_FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$OUT/$f"
  else
    echo "خطأ: ملف الواجهة غير موجود: $f" >&2
    exit 1
  fi
done

# إعداد الاستمارة: نفس الملفات اللي يقرؤها الخادم — مصدر واحد للحدود
# والدول. (عامّة عمداً: لا أسرار فيها، والخادم يعيد التحقّق من كل شيء.)
mkdir -p "$OUT/config"
cp "$ROOT/functions/nutrition.config.json" "$OUT/config/nutrition.json"
cp "$ROOT/functions/countries.json"        "$OUT/config/countries.json"

# أصول ثابتة عامّة (إن وُجدت لاحقًا: شعار، أيقونات…)
[ -d "$ROOT/assets" ] && cp -R "$ROOT/assets" "$OUT/assets"

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
