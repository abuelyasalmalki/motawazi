"use strict";

/* ============================================================
   متوازي · جدول الباقات — المصدر الوحيد للحقيقة
   ============================================================
   ⚠️ المبلغ بالهللات لا بالريالات: ٤٩ ريالًا = 4900.
   ⚠️ ولا يُقرأ مبلغٌ ولا مدّةٌ من المتصفّح إطلاقًا — `plan` وحده يصل،
      والباقي يُشتقّ هنا.

   كل باقة تحمل مدّتها (`days`) — قابلة للتغيير لكل باقة على حدة.
   لإضافة باقة جديدة (مثل اشتراك ٣ شهور مع الدفتر المطبوع) أضف سطرًا هنا
   بمفتاحٍ جديد، ومدّته وسعره، ولا شيء غيره يتغيّر في الخادم.

   🔴 الأسعار placeholders (`amount: null`) حتى تُحدَّد.
      والباقة بلا سعرٍ صالح **لا تُباع**: `resolvePlan` يرجعها، و`isSellable`
      يرفضها، فـcreatePayment يردّ «الباقة غير متاحة بعد» بدل أن يفتح فاتورة
      بمبلغٍ خاطئ.
   ============================================================ */

const PLANS = Object.freeze({
  basic: Object.freeze({
    plan: "basic",
    days: 30,
    amount: null,          // TODO: السعر بالهللات
    label: "الأساسية",
    desc: "جدول غذائي ورياضي ومتابعة شهرية"
  }),
  followup: Object.freeze({
    plan: "followup",
    days: 30,
    amount: null,          // TODO: السعر بالهللات
    label: "المتابعة",
    desc: "جدول غذائي ورياضي ومتابعة أسبوعية",
    featured: true
  }),
  intensive: Object.freeze({
    plan: "intensive",
    days: 30,
    amount: null,          // TODO: السعر بالهللات
    label: "المكثّفة",
    desc: "متابعة أسبوعية وتواصل مباشر مع الأخصائي"
  })
});

/* ⚠️ الباقة المجهولة تُرفض ولا تُبدَّل بافتراض — خطأٌ مطبعيّ في المفتاح
   لا يصير عملية شراءٍ لم يخترها العميل. */
function resolvePlan(raw) {
  if (typeof raw !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PLANS, raw) ? PLANS[raw] : null;
}

/* قابلة للبيع = سعرٌ صحيحٌ موجب بالهللات + مدّةٌ صحيحةٌ موجبة */
function isSellable(p) {
  return !!p
    && Number.isInteger(p.amount) && p.amount > 0
    && Number.isInteger(p.days) && p.days > 0;
}

module.exports = { PLANS, resolvePlan, isSellable };
