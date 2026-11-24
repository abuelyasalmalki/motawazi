"use strict";

/* ============================================================
   متوازي · إعدادات الدوال — الأسرار والإقليم والأصل والوضع
   ============================================================
   🔴 لا مفتاح حقيقيّ في المستودع، ولا في أي ملفٍ يُرفَع.
   القيم تُوضَع من خارج الكود في Secret Manager:

     firebase functions:secrets:set MOYASAR_SECRET_KEY
     firebase functions:secrets:set MOYASAR_WEBHOOK_TOKEN

   والدالّة تقرؤها وقت التشغيل بـ`.value()` — لا وقت التحميل.
   ============================================================ */

const { defineSecret, defineString } = require("firebase-functions/params");

/* أسرار ميسر لا تُسجَّل في البيان العام إلا عند تفعيل ENABLE_MOYASAR=true
   حتى لا يفشل نشر دوال الاستمارة والاعتماد قبل تفعيل Secret Manager */
const MOYASAR_ENABLED = process.env.ENABLE_MOYASAR === "true";
const MOYASAR_SECRET_KEY = MOYASAR_ENABLED ? defineSecret("MOYASAR_SECRET_KEY") : { value: () => "" };
const MOYASAR_WEBHOOK_TOKEN = MOYASAR_ENABLED ? defineSecret("MOYASAR_WEBHOOK_TOKEN") : { value: () => "" };

/* أصل الموقع — منه تُبنى روابط العودة بعد الدفع.
   يُضبط عند اللزوم في functions/.env (مُستبعَد من Git). */
const SITE_ORIGIN = defineString("SITE_ORIGIN", { default: "https://motawazi.com" });

/* إعدادات إشعار استمارة العميل للأخصائي عبر البريد (Resend) — لا تُعطّل النشر إن كانت فارغة */
const NOTIFY_EMAIL = defineString("NOTIFY_EMAIL", { default: "abuelyasalmalki@gmail.com" });
const RESEND_API_KEY = defineString("RESEND_API_KEY", { default: "" });
const RESEND_FROM = defineString("RESEND_FROM", { default: "متوازي <onboarding@resend.dev>" });

/* 🔴 الإقليم — اجعله **إقليم Firestore نفسه** الذي تختاره عند إنشاء قاعدة
   البيانات، وإلا صارت كل قراءةٍ وكتابةٍ عبورًا بين إقليمين.
   الافتراض: الدمّام (me-central2) — البيانات صحية، فإبقاؤها في السعودية أولى.
   ⚠️ وتغييره بعد النشر يُنشئ دالّةً جديدة ويترك القديمة عاملة — احذف
   القديمة يدويًّا، وحدّث REGION في account.html و start.js بنفس القيمة. */
const REGION = "europe-west1";

/* أصول متصفّح مسموح لها بنداء الدالّة (CORS):
   الإنتاج motawazi.com، وبيئات معاينة Cloudflare Pages. */
const ORIGINS = [
  /^https:\/\/(www\.)?motawazi\.com$/,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/
];

/* الوضع (اختبار/إنتاج) **يحدّده مفتاح الواجهة وحده** — التنفيذ في verify.js */
const { isLiveKey } = require("./verify");

/* أصل الموقع بلا شرطةٍ مائلةٍ زائدة في آخره */
function siteOrigin() {
  return String(SITE_ORIGIN.value() || "").replace(/\/+$/, "");
}

/* مسارات العودة — بلا امتداد `.html` (صيغة الروابط: STACK.md).
   صفحة الحساب نفسها تستقبل العائد من الدفع وتعرض حالة الطلب. */
const RETURN_PATH = "/account";
const BACK_PATH = "/account#plans";

/* نافذة إعادة استعمال الطلب المعلّق: ضغطتان على «اشترك» ⇒ نفس الفاتورة */
const REUSE_WINDOW_MS = 15 * 60 * 1000;

module.exports = {
  MOYASAR_SECRET_KEY,
  MOYASAR_WEBHOOK_TOKEN,
  SITE_ORIGIN,
  NOTIFY_EMAIL,
  RESEND_API_KEY,
  RESEND_FROM,
  REGION,
  ORIGINS,
  RETURN_PATH,
  BACK_PATH,
  REUSE_WINDOW_MS,
  isLiveKey,
  siteOrigin
};
