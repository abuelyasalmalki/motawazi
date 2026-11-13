"use strict";

/* ============================================================
   القرارات الحسّاسة — وحدةٌ نقيّة بلا أي تبعيّة
   ============================================================
   كلُّ ما يقرّر «أَتُفعِّل أم لا؟» و«إلى متى؟» هنا، مفصولًا عن Firebase عمدًا:
   ما لا يُختبَر لا يُصدَّق، وهذي الدوالّ تُختبَر بـ`node functions/test.js`
   بلا شبكةٍ ولا محاكٍ ولا مفتاح.
   ============================================================ */

const crypto = require("node:crypto");

const DAY_MS = 86400000;

/* ============================================================
   مقارنةٌ آمنةٌ زمنيًّا للرمز السرّي
   ============================================================
   `timingSafeEqual` ترمي إن اختلف الطولان — والرمي نفسه يسرّب الطول.
   فنبصم الطرفين بـSHA-256: الطولان ٣٢ بايت دائمًا، والمقارنة ثابتة الزمن
   حقًّا. و`===` ممنوعة هنا. */
function safeEqual(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  if (!expected) return false;   // رمزٌ غير مضبوط لا يطابق شيئًا — ولا الفراغ
  const a = crypto.createHash("sha256").update(given, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

/* ============================================================
   الوضع من المفتاح وحده — توثيق ميسر
   ============================================================
   مفتاحٌ يحمل `_test_` ⇒ اختبار. وما عداه ⇒ إنتاج: المجهول يُشدَّد
   لا يُرخَّص. ولا علَمَ منفصلًا يمكن أن يخالف المفتاح. */
function isLiveKey(key) {
  return !/_test_/.test(String(key || ""));
}

/* ============================================================
   تنقية المعرّف
   ============================================================
   شرطةٌ مائلةٌ في معرّف وثيقة تنقل القراءة إلى مجموعةٍ أخرى. والحارس مطبَّق
   على كل مرشّحٍ بلا استثناء — ولو ذهب إلى `where` لا إلى مسار. */
function sanitizeId(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 200) return null;
  if (s.indexOf("/") >= 0 || s === "." || s === "..") return null;
  return s;
}

/* ============================================================
   مرشّحات الربط — مرتَّبةً بالأولوية
   ============================================================
   ⚠️ **ميسر لا تنقل `metadata` من الفاتورة إلى كائن الدفع** (مقيسٌ حيًّا).
      فحدث `payment_paid` يصل غالبًا بلا `metadata` إطلاقًا، و`metadata.orderId`
      وحده كان يترك كل عمليةٍ بلا ربط.

   ١. **`invoice_id`** — الطريق الأوّل. يُطابَق بحقل `invoiceId` المحفوظ في
      الوثيقة وقت الإنشاء (`createPayment.js`)، **لا بمعرّف الوثيقة**:
      معرّف الوثيقة `uuid` نولّده، ومعرّف الفاتورة تولّده ميسر.
   ٢. **`metadata.orderId`** — احتياطًا، حين تصل `metadata` (وهو معرّف
      الوثيقة مباشرةً).

   ⚠️ و`data.id` معرّفُ **دفعةٍ** — لا يصلح للربط في أيّ حال. */
function orderKeys(data) {
  const out = [];
  const inv = sanitizeId(data && data.invoice_id);
  if (inv) out.push({ by: "invoice", value: inv });

  const meta = data && data.metadata;
  const mid = sanitizeId(meta && (meta.orderId || meta.order_id));
  if (mid) out.push({ by: "metadata", value: mid });

  return out;
}

/* ميلي‑ثانية من قيمةٍ قد تكون Timestamp أو رقمًا.
   والرقم وارد: تفعيلاتٌ يدويّةٌ قديمة من الكونسول كُتبت أرقامًا. */
function toMillis(v) {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number" && isFinite(v)) return v;
  return 0;
}

/* ============================================================
   نهاية الاشتراك الجديدة
   ============================================================
   (الحالي إن كان ساريًا، وإلا الآن) + أيام الخطة.
   فمشتركٌ سارٍ يجدّد **تُضاف مدّته إلى المتبقّي** لا تستبدله؛ ومنتهٍ يبدأ
   من الآن فلا يُمنح أيامًا مضت.
   ⚠️ و`nowMs` ساعةُ الخادم لا ساعةُ الجهاز. */
function nextSubEndsMs(currentMs, nowMs, days) {
  const cur = typeof currentMs === "number" && isFinite(currentMs) ? currentMs : 0;
  const base = cur > nowMs ? cur : nowMs;
  return base + Number(days) * DAY_MS;
}

/* ============================================================
   سُلّم الرفض — أَيُفعَّل هذا الطلب أم لا؟
   ============================================================
   تُستدعى **داخل المعاملة** بعد قراءة الوثيقة، فتقرأ حالةً محبوسة لا
   حالةً قديمة. وكونها نقيّةً هو ما يجعل «ست رسائل ⇒ تفعيلٌ واحد» بندًا
   مُثبَتًا لا مُدّعى.

   `order` = بيانات الوثيقة، أو `null` إن لم توجد. */
function decidePaid(order, data) {
  if (!order) return { ok: false, reason: "طلبٌ مجهول" };

  /* ⚠️ الحياديّة: الإعادات الستّ تمرّ من هنا وتُفعِّل مرّةً واحدة */
  if (order.applied === true) return { ok: false, reason: "مُفعَّلٌ سلفًا — خروجٌ هادئ" };

  /* ربطٌ ثانٍ فوق metadata: الفاتورة التي أنشأناها هي المدفوعة */
  const incomingInv = data && data.invoice_id;
  if (order.invoiceId && incomingInv && String(incomingInv) !== String(order.invoiceId)) {
    return {
      ok: false,
      reason: "فاتورةٌ مخالفة للمحفوظة",
      detail: { saved: order.invoiceId, incoming: incomingInv }
    };
  }

  /* ⚠️ المبلغ يُقارَن بالمحفوظ في الوثيقة لا بالجدول الحيّ.
     والمقارنة على رقمٍ صحيحٍ من الهللات — لا كسور. */
  const incomingAmount = Number(data && data.amount);
  const savedAmount = Number(order.amount);
  if (!isFinite(incomingAmount) || !isFinite(savedAmount) || incomingAmount !== savedAmount) {
    return {
      ok: false,
      reason: "مبلغٌ مخالف للمحفوظ",
      detail: { saved: order.amount, incoming: data && data.amount }
    };
  }

  if (!order.uid || typeof order.uid !== "string") {
    return { ok: false, reason: "وثيقةٌ ناقصة (uid)" };
  }
  if (!(Number(order.days) > 0)) {
    return { ok: false, reason: "وثيقةٌ ناقصة (days)" };
  }

  return { ok: true, reason: "فُعِّل" };
}

/* ⚠️ لا يُخفَض إلا المعلّق. رسالةُ فشلٍ متأخّرةٌ بعد نجاحٍ مسجَّل كانت
   ستُسقط اشتراكًا مفعَّلًا — والإعادات تصل بترتيبٍ غير مضمون. */
function decideFailed(order) {
  if (!order) return { ok: false, reason: "طلبٌ مجهول" };
  if (order.status !== "pending") {
    return { ok: false, reason: "ليس معلّقًا — لا يُمسّ (" + String(order.status) + ")" };
  }
  return { ok: true, reason: "فشلٌ مسجَّل" };
}

module.exports = {
  DAY_MS,
  safeEqual,
  isLiveKey,
  sanitizeId,
  orderKeys,
  toMillis,
  nextSubEndsMs,
  decidePaid,
  decideFailed
};
