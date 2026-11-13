# STACK — حقائق بنية متوازي (مصدر واحد للحقيقة)

> التعليقات في الكود لا تذكر حقائق البنية (الاستضافة، الفرع، مجلد الإخراج، صيغة
> الروابط). إن لزم، تُشير إلى هذا الملف. الحقيقة تعيش هنا ويُحدَّث هذا الملف وحده.

## نظرة عامة

```
المتصفح ──► Cloudflare Pages (motawazi.com)  ← صفحات ثابتة من dist/
   │
   ├──► Firebase Auth        ← تسجيل الدخول (Google + بريد/كلمة مرور)
   ├──► Firestore            ← users/{uid} و orders/{id} (قراءة فقط للعميل)
   └──► Cloud Functions ──► createPayment ──► ميسر (فاتورة) ──► صفحة الدفع
                                                         │
        moyasarWebhook ◄──────── ويب-هوك ميسر ◄──────────┘
             └──► يكتب subscribed / subEndsAt / plan في users/{uid}
```

## الاستضافة والنشر — Cloudflare Pages
- **المستودع:** `abuelyasalmalki/motawazi`.
- **أمر البناء:** `bash build_site.sh` — ينتج **`dist/`** بقائمة سماح (لا يُنشر المستودع كاملاً).
- **مجلد الإخراج:** `dist`.
- **فرع الإنتاج:** `main`. كل push لفرع ثاني يعطي **Preview** فقط على `*.pages.dev`.
- **الدومين:** `motawazi.com` (محجوز في Cloudflare) + `www.motawazi.com`.
- **404:** `404.html` يُشحن في `dist/` فيخدمه Pages بحالة HTTP 404.

## الروابط
- **بلا امتداد `.html`:** Cloudflare Pages يخدم `/account` ويحوّل `/account.html` ← `/account` بـ308.
  فكل الروابط الداخلية ومسارات العودة من الدفع بلا امتداد.
  (الأصول `.js`/`.css`/`.png` تبقى بامتدادها.)

## Firebase — مشروع مستقل تماماً
- مشروع جديد خاص بمتوازي، **لا يشارك أي مشروع آخر** (البيانات صحية).
- **الخدمات:** Authentication + Firestore + Cloud Functions (تحتاج خطة **Blaze**).
  ليست الاستضافة — الاستضافة Cloudflare.
- **الإقليم:** `me-central2` (الدمّام) — `REGION` في `functions/config.js` و `account.html`
  يطابق إقليم Firestore.
- **إعداد الويب:** `firebase-config.js`. **القواعد:** `firestore.rules`.
  **الفهرس:** `firestore.indexes.json` (orders: uid ↑، createdAt ↓).
- **النشر:** `firebase deploy --only firestore,functions`.

### بيانات Firestore الحالية
| المسار | يكتبه | يقرؤه |
|---|---|---|
| `users/{uid}` | المتصفح: `name` و `email` و `updated` · الويب-هوك وحده: `subscribed` و `subEndsAt` و `plan` | صاحبه |
| `orders/{id}` | الدوال وحدها | صاحبه |

## الدفع — ميسر (Moyasar)
- **الطريقة:** فاتورة مستضافة (`POST /v1/invoices`) — العميل يدفع في صفحة ميسر.
- **المسار:**
  1. `account` ← `createPayment({ plan })` — المتصفح يرسل مفتاح الباقة فقط.
  2. الدالّة تشتقّ السعر والمدّة من `functions/plans.js`، وتنشئ `orders/{id}` بحالة `pending`، ثم الفاتورة.
  3. العميل يدفع ← يرجع إلى `/account?order=<id>`.
  4. ميسر يرسل `payment_paid` إلى `moyasarWebhook` ← تحقّق الرمز والوضع والمبلغ ← `subscribed: true`،
     و `subEndsAt` = (الحالي إن كان سارياً، وإلا الآن) + أيام الباقة، و `plan`.
  5. صفحة الحساب تتابع وثيقة الطلب حتى تصير `paid`.
- **الأسرار:** `MOYASAR_SECRET_KEY` و `MOYASAR_WEBHOOK_TOKEN` في Secret Manager — لا في الكود.
- **الوضع:** المفتاح `sk_test_…` ⇒ اختبار، غيره ⇒ إنتاج.
- **التفاصيل:** `functions/README.md`.

## الاختبار
- `node functions/test.js` — منطق الدفع بلا شبكة ولا مفتاح.
- `bash build_site.sh` — يفشل إذا نقصت صفحة أو تسرّب ملف محظور.
