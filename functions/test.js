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

/* ============================================================
   الاستمارة الصحية — nutrition.js
   ============================================================ */
const N = require("./nutrition");
const NCFG = require("./nutrition.config.json");
const CODES = require("./countries.json").map((c) => c.code);

group("١١ · ملف إعداد التغذية");
eq("🔴 الإعداد الحالي صالح", N.validateConfig(NCFG), []);
ok("نسب المغذيات مجموعها ≠ 1 ⇒ مرفوض",
   N.validateConfig(Object.assign({}, NCFG, { macros: { protein: 0.3, carbs: 0.5, fat: 0.3 } })).length > 0);
ok("معامل نشاط ناقص ⇒ مرفوض",
   N.validateConfig(Object.assign({}, NCFG, { activityFactors: { sedentary: 1.2 } })).length > 0);
ok("حد أدنى مفقود ⇒ مرفوض",
   N.validateConfig(Object.assign({}, NCFG, { minCalories: { male: 1500 } })).length > 0);
eq("السعودية أول الدول", CODES[0], "SA");
eq("٢٢ دولة عربية", CODES.length, 22);

/* إجابات كاملة سليمة — ثم نغيّر حقلاً واحداً في كل حالة */
const BASE = Object.freeze({
  country: "SA", sex: "female", age: 30, heightCm: 165, weightKg: 80,
  goal: "lose", pace: "moderate", targetKg: 68, activity: "moderate",
  health: { diabetes: false, hypertension: false, heart: false, kidneyLiver: false,
            pregnancy: false, surgery: false, eatingDisorder: false },
  medications: { has: false, text: "" }, allergies: { has: false, text: "" },
  dislikes: "", vegetarian: false, consent: { terms: true, health: true }
});
function withA(patch) { return Object.assign(JSON.parse(JSON.stringify(BASE)), patch); }
function withH(patch) { const a = withA({}); Object.assign(a.health, patch); return a; }
const val = (a) => N.validateAnswers(a, NCFG, CODES);

group("١٢ · التحقّق من الإجابات");
eq("إجابات سليمة ⇒ مقبولة", val(BASE).errors, []);
ok("دولة غير عربية ⇒ مرفوضة", val(withA({ country: "US" })).errors.indexOf("country") >= 0);
ok("جنس مجهول ⇒ مرفوض", val(withA({ sex: "x" })).errors.indexOf("sex") >= 0);
ok("طول خارج الحدود ⇒ مرفوض", val(withA({ heightCm: 90 })).errors.indexOf("heightCm") >= 0);
ok("وزن خارج الحدود ⇒ مرفوض", val(withA({ weightKg: 500 })).errors.indexOf("weightKg") >= 0);
ok("وزن مستهدف أعلى من الحالي ⇒ مرفوض",
   val(withA({ targetKg: 85 })).errors.indexOf("targetKg_not_lower") >= 0);
ok("نزول بلا سرعة ⇒ مرفوض", val(withA({ pace: null })).errors.indexOf("pace") >= 0);
eq("المحافظة ⇒ لا سرعة ولا هدف مطلوبان", val(withA({ goal: "maintain", pace: null, targetKg: null })).errors, []);
ok("سؤال صحي بلا إجابة ⇒ مرفوض",
   val(withH({ diabetes: undefined })).errors.indexOf("health.diabetes") >= 0);
ok("سؤال اضطرابات الأكل إلزامي",
   val(withH({ eatingDisorder: undefined })).errors.indexOf("health.eatingDisorder") >= 0);
eq("سؤال الحمل لا يُطلب من الرجل", val(withA({ sex: "male", health: Object.assign({}, BASE.health, { pregnancy: undefined }) })).errors, []);
ok("أدوية بنعم بلا اسم ⇒ مرفوض",
   val(withA({ medications: { has: true, text: "" } })).errors.indexOf("medications.text") >= 0);
ok("نصّ طويل جداً ⇒ مرفوض",
   val(withA({ dislikes: "x".repeat(NCFG.limits.textMax + 1) })).errors.indexOf("dislikes") >= 0);
ok("بلا موافقة الشروط ⇒ مرفوض",
   val(withA({ consent: { terms: false, health: true } })).errors.indexOf("consent.terms") >= 0);
ok("بلا موافقة البيانات الصحية ⇒ مرفوض",
   val(withA({ consent: { terms: true, health: false } })).errors.indexOf("consent.health") >= 0);
ok("حقل زائد يُهمَل", !("isAdmin" in val(withA({ isAdmin: true })).answers));
ok("🔴 لا يمكن تمرير السعرات أو الحالة", !("calc" in val(withA({ calc: { kcal: 9000 }, status: "approved" })).answers));
ok("الأرقام النصّية تُقبل", val(withA({ age: "30", heightCm: "165" })).ok === true);

group("١٣ · 🔴 العمر — للبالغين فقط حالياً");
ok("١٨ ⇒ مقبول", val(withA({ age: 18 })).ok === true);
ok("١٧ ⇒ مرفوض بـage_not_eligible", val(withA({ age: 17 })).errors.indexOf("age_not_eligible") >= 0);
ok("١٠ ⇒ مرفوض", val(withA({ age: 10 })).errors.indexOf("age_not_eligible") >= 0);
eq("الأهلية: ١٧ ⇒ too_young (ولي الأمر معطّل)", N.ageEligibility(17, NCFG), "too_young");
/* إعادة تفعيل ولي الأمر لاحقاً = تعديل الإعداد فقط */
const GCFG = Object.assign({}, NCFG, { guardian: { enabled: true, minAge: 13 } });
eq("ولي الأمر مفعّل: ١٥ ⇒ minor", N.ageEligibility(15, GCFG), "minor");
eq("ولي الأمر مفعّل: ١٢ ⇒ too_young", N.ageEligibility(12, GCFG), "too_young");
const minorV = N.validateAnswers(withA({ age: 15 }), GCFG, CODES);
ok("قاصر بلا بيانات ولي الأمر ⇒ مرفوض", minorV.errors.indexOf("guardian.consent") >= 0);
const minorOk = N.validateAnswers(withA({ age: 15, guardian: { name: "أحمد", relation: "أب", phone: "0500000000", consent: true } }), GCFG, CODES);
ok("قاصر ببيانات ولي الأمر ⇒ مقبول", minorOk.ok === true);
ok("قاصر ⇒ معلّم للأخصائي",
   N.triage(minorOk.answers, N.computeCalc(minorOk.answers, GCFG), GCFG, minorOk.eligibility).reasons.indexOf("minor") >= 0);

group("١٤ · حساب السعرات — Mifflin-St Jeor");
const c1 = N.computeCalc(val(BASE).answers, NCFG);
/* امرأة ٣٠، ١٦٥سم، ٨٠كجم: 800 + 1031.25 − 150 − 161 = 1520.25
   × 1.55 = 2356.4 − 500 = 1856.4 ⇒ 1860 */
eq("الحرق الأساسي (امرأة)", c1.bmr, 1520);
eq("الاحتياج اليومي", c1.tdee, 2356);
eq("السعرات بعد العجز", c1.kcal, 1860);
eq("المغذيات بالجرام", c1.macros, { protein: 116, carbs: 209, fat: 62 });
eq("مؤشر كتلة الجسم", c1.bmi, 29.4);
eq("نسخة الإعداد محفوظة", c1.configVersion, NCFG.version);
/* رجل ٤٠، ١٨٠سم، ١٠٠كجم: 1000 + 1125 − 200 + 5 = 1930 × 1.2 = 2316 − 750 = 1566 ⇒ 1570 */
const c2 = N.computeCalc(val(withA({ sex: "male", age: 40, heightCm: 180, weightKg: 100, targetKg: 85,
  activity: "sedentary", pace: "faster" })).answers, NCFG);
eq("رجل خامل بعجز أسرع", [c2.bmr, c2.kcal, c2.raisedToMin], [1930, 1570, false]);
const c3 = N.computeCalc(val(withA({ goal: "maintain", pace: null, targetKg: null })).answers, NCFG);
eq("المحافظة ⇒ بلا عجز", [c3.deficit, c3.kcal], [0, 2360]);

group("١٥ · 🔴 الحد الأدنى الآمن — لا نزول تحته أبداً");
/* امرأة ٦٠، ١٥٥سم، ٥٥كجم، خاملة، أسرع: 1269 − 750 = 519 ⇒ يُرفع لـ1200 */
const c4 = N.computeCalc(val(withA({ age: 60, heightCm: 155, weightKg: 55, targetKg: 50,
  activity: "sedentary", pace: "faster" })).answers, NCFG);
eq("يُرفع للحد الأدنى للنساء", [c4.kcal, c4.raisedToMin], [NCFG.minCalories.female, true]);
const c5 = N.computeCalc(val(withA({ sex: "male", age: 70, heightCm: 160, weightKg: 55, targetKg: 52,
  activity: "sedentary", pace: "faster" })).answers, NCFG);
eq("يُرفع للحد الأدنى للرجال", c5.kcal, NCFG.minCalories.male);
/* مسحٌ شامل: لا تركيبة تنزل تحت الحد */
let below = 0, combos = 0;
["male", "female"].forEach((sex) => [18, 40, 80].forEach((age) => [150, 175, 200].forEach((h) =>
  [45, 70, 150].forEach((w) => N.ACTIVITY.forEach((act) => N.PACES.forEach((pace) => {
    const c = N.computeCalc({ sex, age, heightCm: h, weightKg: w, targetKg: w - 1,
      goal: "lose", pace, activity: act }, NCFG);
    combos++;
    if (c.kcal < NCFG.minCalories[sex]) below++;
  }))))));
eq("🔴 " + combos + " تركيبة: ولا وحدة تحت الحد الأدنى", below, 0);
/* الحد يُقرأ من الإعداد لا من الكود */
const c6 = N.computeCalc(val(withA({ age: 60, heightCm: 155, weightKg: 55, targetKg: 50,
  activity: "sedentary", pace: "faster" })).answers,
  Object.assign({}, NCFG, { minCalories: { female: 1300, male: 1600 } }));
eq("تغيير الحد في الإعداد يغيّر النتيجة", c6.kcal, 1300);

group("١٦ · الفرز الصحي");
const tri = (a) => { const v = val(a); return N.triage(v.answers, N.computeCalc(v.answers, NCFG), NCFG, v.eligibility); };
eq("بلا حالات ⇒ غير معلّم", tri(BASE), { flagged: false, reasons: [] });
N.HEALTH_KEYS.forEach((k) => {
  const r = tri(withH({ [k]: true }));
  ok("نعم على " + k + " ⇒ معلّم", r.flagged && r.reasons.indexOf(k) >= 0);
});
ok("🔴 اضطرابات الأكل ⇒ معلّم", tri(withH({ eatingDisorder: true })).reasons.indexOf("eatingDisorder") >= 0);
ok("أدوية ⇒ معلّم", tri(withA({ medications: { has: true, text: "دواء" } })).reasons.indexOf("medications") >= 0);
eq("الحساسية وحدها ⇒ غير معلّم", tri(withA({ allergies: { has: true, text: "فول سوداني" } })).flagged, false);
ok("مؤشر منخفض ⇒ معلّم", tri(withA({ weightKg: 48, targetKg: 46 })).reasons.indexOf("bmi_low") >= 0);
ok("مؤشر عالي جداً ⇒ معلّم", tri(withA({ weightKg: 115, targetKg: 90 })).reasons.indexOf("bmi_high") >= 0);
ok("وزن مستهدف بمؤشر منخفض ⇒ معلّم", tri(withA({ weightKg: 60, targetKg: 48 })).reasons.indexOf("target_bmi_low") >= 0);
eq("الرجل لا يُعلَّم بالحمل", tri(withA({ sex: "male", targetKg: 70, health: Object.assign({}, BASE.health, { pregnancy: true }) })).reasons.indexOf("pregnancy"), -1);

/* ============================================================ */
console.log("\n" + "─".repeat(52));
if (fails.length) {
  console.log("❌ فشل " + fails.length + " من " + (pass + fails.length) + ":");
  fails.forEach((f) => console.log("   • " + f));
  process.exit(1);
}
console.log("✅ نجحت " + pass + " حالة — بلا شبكةٍ ولا مفتاحٍ ولا محاكٍ.");
