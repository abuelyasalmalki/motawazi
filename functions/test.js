"use strict";

/* ============================================================
   متوازي · اختبارات القرارات الحسّاسة — `node functions/test.js`
   ============================================================
   بلا شبكة، بلا محاكٍ، بلا مفتاح، وبلا `npm install`.
   كلُّ بندٍ هنا بندٌ من قائمة التحقّق النهائية — يُقاس ولا يُدّعى.
   ============================================================ */

const V = require("./verify");
const { resolvePlan, isSellable, PLANS } = require("./plans");

let pass = 0;
const fails = [];

function ok(name, cond) {
  if (cond) { pass++; return; }
  fails.push(name);
}
function eq(name, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) fails.push(name + "  ← وجدتُ " + JSON.stringify(got) + " وتوقّعتُ " + JSON.stringify(want));
  else pass++;
}
function group(t) { console.log("\n" + t); }

const DAY = 86400000;

/* ============================================================ */
group("١ · الرمز السرّي — رفضٌ عند الخطأ، ومقارنةٌ آمنةٌ زمنيًّا");

ok("الرمز الصحيح يُقبل", V.safeEqual("tok_abc123", "tok_abc123") === true);
ok("رمزٌ خاطئ يُرفض", V.safeEqual("tok_WRONG", "tok_abc123") === false);
ok("رمزٌ أقصر يُرفض بلا رمي", V.safeEqual("tok", "tok_abc123") === false);
ok("رمزٌ أطول يُرفض بلا رمي", V.safeEqual("tok_abc123456789", "tok_abc123") === false);
ok("فرقُ حرفٍ واحد يُرفض", V.safeEqual("tok_abc124", "tok_abc123") === false);
ok("حساسٌ لحالة الأحرف", V.safeEqual("TOK_ABC123", "tok_abc123") === false);
ok("رمزٌ غير مضبوط لا يطابق الفراغ", V.safeEqual("", "") === false);
ok("رمزٌ غير مضبوط يرفض أي وارد", V.safeEqual("anything", "") === false);
ok("غير النصّ يُرفض (null)", V.safeEqual(null, "tok_abc123") === false);
ok("غير النصّ يُرفض (كائن)", V.safeEqual({}, "tok_abc123") === false);
ok("غير النصّ يُرفض (رقم)", V.safeEqual(123, "tok_abc123") === false);
ok("مسافةٌ زائدة تُرفض", V.safeEqual("tok_abc123 ", "tok_abc123") === false);

/* ============================================================ */
group("٢ · الوضع من المفتاح وحده — والمجهول يُشدَّد لا يُرخَّص");

ok("مفتاح اختبار ⇒ ليس إنتاجًا", V.isLiveKey("sk_test_abc123") === false);
ok("مفتاح إنتاج ⇒ إنتاج", V.isLiveKey("sk_live_abc123") === true);
ok("مفتاحٌ مجهول الشكل ⇒ يُعامَل إنتاجًا", V.isLiveKey("weird_key") === true);
ok("مفتاحٌ فارغ ⇒ يُعامَل إنتاجًا", V.isLiveKey("") === true);
ok("null ⇒ يُعامَل إنتاجًا", V.isLiveKey(null) === true);

/* ============================================================ */
group("٣ · مرشّحات الربط — invoice_id أوّلًا وmetadata احتياطًا");

/* 🔴 الحالة التي أسقطت الرحلة الحيّة: ميسر لا تنقل metadata من الفاتورة
   إلى كائن الدفع، فالحدث يصل بلا metadata إطلاقًا. */
eq("🔴 بلا metadata وبـinvoice_id ⇒ يُربَط بالفاتورة",
   V.orderKeys({ id: "pay_1", invoice_id: "inv_9" }),
   [{ by: "invoice", value: "inv_9" }]);

eq("الاثنان معًا ⇒ الفاتورة أوّلًا والـmetadata احتياطًا",
   V.orderKeys({ invoice_id: "inv_9", metadata: { orderId: "ord_1" } }),
   [{ by: "invoice", value: "inv_9" }, { by: "metadata", value: "ord_1" }]);

eq("بلا فاتورة ⇒ metadata وحدها",
   V.orderKeys({ metadata: { orderId: "ord_1" } }),
   [{ by: "metadata", value: "ord_1" }]);
eq("order_id مرادفًا",
   V.orderKeys({ metadata: { order_id: "ord_1" } }),
   [{ by: "metadata", value: "ord_1" }]);

eq("لا هذا ولا ذاك ⇒ لا مرشّح", V.orderKeys({ id: "pay_1" }), []);
eq("metadata فارغة وبلا فاتورة ⇒ لا مرشّح", V.orderKeys({ metadata: {} }), []);
eq("🔴 data.id لا يصلح للربط أبدًا", V.orderKeys({ id: "pay_1", metadata: {} }), []);
eq("المسافات تُقلَّم", V.orderKeys({ invoice_id: "  inv_9  " }), [{ by: "invoice", value: "inv_9" }]);
eq("غير النصّ يُهمَل", V.orderKeys({ invoice_id: 42, metadata: { orderId: 7 } }), []);

/* حارس الشرطة المائلة — محفوظٌ على كلا المرشّحين */
eq("🔴 شرطةٌ مائلة في metadata ⇒ تُسقَط (منعُ الانتقال لمجموعةٍ أخرى)",
   V.orderKeys({ metadata: { orderId: "users/victim" } }), []);
eq("🔴 شرطةٌ مائلة في invoice_id ⇒ تُسقَط أيضًا",
   V.orderKeys({ invoice_id: "orders/other" }), []);
eq("نقطتان ⇒ تُسقَط", V.orderKeys({ invoice_id: ".." }), []);
eq("طولٌ مفرط ⇒ يُسقَط", V.orderKeys({ invoice_id: "x".repeat(201) }), []);
eq("فاتورةٌ فاسدة لا تُلغي metadata السليمة",
   V.orderKeys({ invoice_id: "a/b", metadata: { orderId: "ord_1" } }),
   [{ by: "metadata", value: "ord_1" }]);

/* التنقية نفسها */
eq("sanitizeId يُقلّم", V.sanitizeId("  x  "), "x");
eq("sanitizeId يرفض الفراغ", V.sanitizeId("   "), null);
eq("sanitizeId يرفض النقطة", V.sanitizeId("."), null);

/* ============================================================ */
group("٤ · التمديد — المدّة تُضاف إلى المتبقّي لا تستبدله");

const NOW = 1800000000000;   // لحظةٌ ثابتة (لا Date.now في اختبار)

eq("مشتركٌ جديد ⇒ من الآن", V.nextSubEndsMs(0, NOW, 60), NOW + 60 * DAY);
eq("اشتراكٌ منتهٍ ⇒ من الآن لا من الماضي",
   V.nextSubEndsMs(NOW - 10 * DAY, NOW, 60), NOW + 60 * DAY);
eq("🔴 مشتركٌ سارٍ يجدّد ⇒ تُضاف إلى المتبقّي",
   V.nextSubEndsMs(NOW + 20 * DAY, NOW, 60), NOW + 80 * DAY);
eq("انتهاءٌ في هذي اللحظة ⇒ من الآن",
   V.nextSubEndsMs(NOW, NOW, 60), NOW + 60 * DAY);
eq("باقة شهرية ٣٠ يومًا", V.nextSubEndsMs(0, NOW, 30), NOW + 30 * DAY);
eq("باقة ٣ شهور (مستقبلًا) ٩٠ يومًا", V.nextSubEndsMs(0, NOW, 90), NOW + 90 * DAY);
eq("قيمةٌ حاليّةٌ فاسدة تُعامَل صفرًا", V.nextSubEndsMs(NaN, NOW, 60), NOW + 60 * DAY);

/* تمديدٌ تراكميّ: ثلاث تجديداتٍ متتالية تُجمع ولا تُستبدل */
let ends = 0;
ends = V.nextSubEndsMs(ends, NOW, 60);
ends = V.nextSubEndsMs(ends, NOW, 60);
ends = V.nextSubEndsMs(ends, NOW, 60);
eq("ثلاث تجديداتٍ ⇒ ١٨٠ يومًا مجموعة", ends, NOW + 180 * DAY);

/* ============================================================ */
group("٥ · قراءة subEndsAt — Timestamp أو رقمٌ قديم");

eq("Timestamp", V.toMillis({ toMillis: () => 12345 }), 12345);
eq("رقم (تفعيلٌ يدويّ قديم)", V.toMillis(1800000000000), 1800000000000);
eq("null ⇒ صفر", V.toMillis(null), 0);
eq("undefined ⇒ صفر", V.toMillis(undefined), 0);
eq("نصّ ⇒ صفر", V.toMillis("1800000000000"), 0);
eq("NaN ⇒ صفر", V.toMillis(NaN), 0);
eq("Infinity ⇒ صفر", V.toMillis(Infinity), 0);

/* ============================================================ */
group("٦ · سُلّم الرفض — payment_paid");

const ORDER = Object.freeze({
  uid: "u_1", plan: "followup", days: 30, amount: 11900,
  status: "pending", applied: false, invoiceId: "inv_9"
});
const EVENT = Object.freeze({ id: "pay_1", amount: 11900, invoice_id: "inv_9" });

ok("طلبٌ سليم ⇒ يُفعَّل", V.decidePaid(ORDER, EVENT).ok === true);
eq("طلبٌ مجهول ⇒ رفضٌ مسجَّل بلا انهيار",
   V.decidePaid(null, EVENT).reason, "طلبٌ مجهول");
ok("🔴 مُفعَّلٌ سلفًا ⇒ خروجٌ هادئ",
   V.decidePaid(Object.assign({}, ORDER, { applied: true }), EVENT).ok === false);
ok("🔴 مبلغٌ أقلّ ⇒ رفض",
   V.decidePaid(ORDER, Object.assign({}, EVENT, { amount: 100 })).ok === false);
ok("مبلغٌ أكبر ⇒ رفض",
   V.decidePaid(ORDER, Object.assign({}, EVENT, { amount: 99900 })).ok === false);
ok("مبلغٌ بالريالات لا الهللات ⇒ رفض",
   V.decidePaid(ORDER, Object.assign({}, EVENT, { amount: 119 })).ok === false);
ok("مبلغٌ مفقود ⇒ رفض",
   V.decidePaid(ORDER, { id: "pay_1", invoice_id: "inv_9" }).ok === false);
ok("فاتورةٌ مخالفة ⇒ رفض",
   V.decidePaid(ORDER, Object.assign({}, EVENT, { invoice_id: "inv_OTHER" })).ok === false);
ok("فاتورةٌ غائبةٌ من الحدث ⇒ لا تُعطِّل المطابقة",
   V.decidePaid(ORDER, { id: "pay_1", amount: 11900 }).ok === true);

/* 🔴 الحمولة الحيّة كما تصل فعلًا: بلا metadata، وبفاتورةٍ صحيحة.
   الربط والحكم معًا — فالبند يُقاس من طرفه إلى طرفه لا نصفًا. */
group("٦-ب · 🔴 حمولةٌ بلا metadata وبـinvoiceId صحيح ⇒ تُفعَّل");
var LIVE_SHAPE = Object.freeze({
  id: "39a2419f-5515-4836-9e7e-dd2c919d1079",
  status: "paid",
  amount: 11900,
  invoice_id: "7d8546dc-0a51-4e98-92e7-b33e77f9de0b"
  /* لا metadata إطلاقًا — هكذا تصل من ميسر */
});
var LIVE_ORDER = Object.freeze({
  uid: "u_1", plan: "followup", days: 30, amount: 11900,
  status: "pending", applied: false,
  invoiceId: "7d8546dc-0a51-4e98-92e7-b33e77f9de0b"
});
var liveKeys = V.orderKeys(LIVE_SHAPE);
eq("  ١ · المرشّح: الفاتورة", liveKeys, [{ by: "invoice", value: LIVE_ORDER.invoiceId }]);
ok("  ٢ · المرشّح يطابق حقل invoiceId المحفوظ",
   liveKeys[0].value === LIVE_ORDER.invoiceId);
ok("  ٣ · 🔴 الحكم: تُفعَّل", V.decidePaid(LIVE_ORDER, LIVE_SHAPE).ok === true);
ok("  ٤ · ولا تُفعَّل بمبلغٍ مخالف رغم صحّة الفاتورة",
   V.decidePaid(LIVE_ORDER, Object.assign({}, LIVE_SHAPE, { amount: 100 })).ok === false);
ok("  ٥ · ولا تُفعَّل مرّتين",
   V.decidePaid(Object.assign({}, LIVE_ORDER, { applied: true }), LIVE_SHAPE).ok === false);
group("٦-ج · بقيّة سُلّم الرفض");
ok("وثيقةٌ بلا uid ⇒ رفض",
   V.decidePaid(Object.assign({}, ORDER, { uid: null }), EVENT).ok === false);
ok("وثيقةٌ بلا days ⇒ رفض",
   V.decidePaid(Object.assign({}, ORDER, { days: 0 }), EVENT).ok === false);

/* 🔴 البند الأثقل: نفس الرسالة ست مرّات ⇒ تفعيلٌ واحد.
   نحاكي المعاملة: كل تفعيلٍ يقلب `applied` كما تفعل الكتابة. */
group("٧ · 🔴 الإعادات الستّ ⇒ تفعيلٌ واحد");
let doc = Object.assign({}, ORDER);
let activations = 0;
for (let i = 1; i <= 6; i++) {
  const v = V.decidePaid(doc, EVENT);
  if (v.ok) { activations++; doc = Object.assign({}, doc, { applied: true, status: "paid" }); }
  console.log("   إعادة " + i + ": " + (v.ok ? "فُعِّل" : v.reason));
}
eq("ستّ رسائل ⇒ تفعيلٌ واحد", activations, 1);

/* والاشتراك لم يُمدَّد ستًّا: التمديد لا يُحسب إلا مع تفعيل */
let subEnds = 0;
doc = Object.assign({}, ORDER);
for (let i = 1; i <= 6; i++) {
  const v = V.decidePaid(doc, EVENT);
  if (v.ok) {
    subEnds = V.nextSubEndsMs(subEnds, NOW, doc.days);
    doc = Object.assign({}, doc, { applied: true });
  }
}
eq("🔴 الاشتراك مُدِّد ٣٠ يومًا لا ١٨٠", subEnds, NOW + 30 * DAY);

/* ============================================================ */
group("٨ · payment_faild — والاشتراك لا يُمسّ");

ok("معلّق ⇒ يُسجَّل فشلًا",
   V.decideFailed({ status: "pending" }).ok === true);
ok("🔴 مدفوعٌ سلفًا ⇒ لا يُخفَض (رسالةٌ متأخّرة)",
   V.decideFailed({ status: "paid" }).ok === false);
ok("فاشلٌ سلفًا ⇒ لا يُكرَّر",
   V.decideFailed({ status: "failed" }).ok === false);
eq("طلبٌ مجهول ⇒ رفضٌ مسجَّل", V.decideFailed(null).reason, "طلبٌ مجهول");

/* وترتيبٌ مقلوب: فشلٌ ثم نجاح ⇒ يُفعَّل (الدفع نجح فعلًا) */
const afterFail = { uid: "u_1", days: 120, amount: 11900, status: "failed", applied: false, invoiceId: "inv_9" };
ok("فشلٌ ثم نجاح ⇒ يُفعَّل", V.decidePaid(afterFail, EVENT).ok === true);
/* ونجاحٌ ثم فشل ⇒ لا يُمسّ */
ok("نجاحٌ ثم فشل ⇒ لا يُمسّ", V.decideFailed({ status: "paid" }).ok === false);

/* ============================================================ */
group("٩ · جدول الباقات — الاشتقاق في الخادم");

["basic", "followup", "intensive"].forEach((k) => {
  ok("باقةٌ معروفة: " + k, !!resolvePlan(k));
  ok("مدّة " + k + " عددٌ صحيحٌ موجب", Number.isInteger(PLANS[k].days) && PLANS[k].days > 0);
});
eq("الباقات الثلاث شهرية حاليًّا",
   ["basic", "followup", "intensive"].map((k) => PLANS[k].days), [30, 30, 30]);
["999d", "", "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", "60d", "Basic"]
  .forEach((k) => ok("مفتاحٌ مرفوض: " + JSON.stringify(k), resolvePlan(k) === null));
ok("رقمٌ مرفوض", resolvePlan(7900) === null);
ok("null مرفوض", resolvePlan(null) === null);
ok("🔴 الباقة المجهولة تُرفض ولا تعود إلى افتراض", resolvePlan("zzz") === null);

group("١٠ · 🔴 لا بيع بلا سعرٍ صالح");
ok("سعر null ⇒ غير قابلة للبيع", isSellable({ amount: null, days: 30 }) === false);
ok("سعر صفر ⇒ غير قابلة للبيع", isSellable({ amount: 0, days: 30 }) === false);
ok("سعر سالب ⇒ غير قابلة للبيع", isSellable({ amount: -100, days: 30 }) === false);
ok("سعر بكسور (ريالات لا هللات) ⇒ غير قابلة للبيع", isSellable({ amount: 49.5, days: 30 }) === false);
ok("سعر نصّي ⇒ غير قابلة للبيع", isSellable({ amount: "4900", days: 30 }) === false);
ok("مدّة صفر ⇒ غير قابلة للبيع", isSellable({ amount: 4900, days: 0 }) === false);
ok("سعرٌ ومدّةٌ صالحان ⇒ قابلة للبيع", isSellable({ amount: 4900, days: 30 }) === true);
ok("null ⇒ غير قابلة للبيع", isSellable(null) === false);
["basic", "followup", "intensive"].forEach((k) =>
  ok("الباقة " + k + " لا تُباع قبل تحديد سعرها (placeholder)",
     PLANS[k].amount !== null || isSellable(PLANS[k]) === false));

/* ============================================================ */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log("❌ فشل " + fails.length + " من " + (pass + fails.length) + ":");
  fails.forEach((f) => console.log("   • " + f));
  process.exit(1);
}
console.log("✅ نجحت " + pass + " حالة — بلا شبكةٍ ولا مفتاحٍ ولا محاكٍ.");
