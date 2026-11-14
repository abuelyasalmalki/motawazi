# متوازي (motawazi.com)

منصة عربية لنزول الوزن: جدول غذائي وجدول رياضي يمشون مع بعض، بمراجعة أخصائي تغذية ومدرب لياقة.

- **القرارات والمراحل:** `CLAUDE.md`
- **البنية والنشر:** `STACK.md` (Cloudflare Pages، Firebase، ميسر)
- **الدوال:** `functions/README.md`

## التشغيل محلياً

```bash
bash build_site.sh          # يبني dist/ (هو اللي ينشره Cloudflare Pages)
node functions/test.js      # اختبارات الدفع والتغذية والفرز
cd tests && npm install && npm test   # اختبارات قواعد Firestore (تحتاج Java)
```
