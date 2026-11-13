"use strict";

/* ============================================================
   عميل ميسر — نقطةُ النهاية والمصادقة والحمولة في مكانٍ واحد
   ============================================================
   الأساس: https://api.moyasar.com/v1
   المصادقة: HTTP Basic — المفتاح السرّي اسمَ مستخدم، وكلمةُ المرور فارغة.
   الوضع (اختبار/إنتاج) يحدّده المفتاح وحده.

   ⚠️ كلُّ ما يخصّ شكل الطلب محصورٌ في هذا الملف عمدًا: إن اختلف اسمُ حقلٍ
   عمّا هنا، فالتعديل سطرٌ واحد لا مطاردةٌ في الكود.
   ============================================================ */

const API_BASE = "https://api.moyasar.com/v1";
const TIMEOUT_MS = 15000;

function authHeader(secretKey) {
  return "Basic " + Buffer.from(String(secretKey) + ":").toString("base64");
}

/* خطأٌ يحمل الحالة والجسم المقصوص — للسجلّ لا للعميل.
   ولا يحمل المفتاح ولا أي ترويسة. */
function apiError(status, body) {
  const e = new Error("moyasar " + status + ": " + String(body || "").slice(0, 400));
  e.status = status;
  return e;
}

async function request(path, secretKey, payload) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      Authorization: authHeader(secretKey),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  const text = await res.text();
  if (!res.ok) throw apiError(res.status, text);

  try {
    return JSON.parse(text);
  } catch (e) {
    throw apiError(res.status, "ردٌّ غير قابل للتفكيك: " + text);
  }
}

/* ============================================================
   فاتورة — البوّابة المستضافة
   ============================================================
   ⚠️ `given_id` **غير مدعومٍ في الفواتير** (خاصٌّ بالمدفوعات). فمعرّف
      الفاتورة يولّده ميسر لا نحن.

   ⚠️ و**ميسر لا تنقل `metadata` من الفاتورة إلى كائن الدفع** (مقيسٌ حيًّا).
      فالربط الفعليّ يقع بـ**معرّف الفاتورة** المحفوظ في `invoiceId`، و
      `metadata` احتياطٌ ثانٍ لا أوّل. تُرسَل مع ذلك: تنفع في لوحة ميسر
      عند الدعم، وتُنقذ الربط لو نُقلت يومًا.

   ⚠️ و`callback_url` **لا يعيد توجيه العميل** — إشعارٌ خادميّ فقط.
      طريق عودة العميل:
        `success_url` ← صفحة العودة بعد الدفع
        `back_url`    ← زرّ الرجوع قبل الدفع
      ونتركه غيرَ مضبوطٍ عمدًا: الإشعار يأتي من ويب-هوك اللوحة وحده،
      وهو الذي يحمل `secret_token`. إشعارٌ ثانٍ بلا رمزٍ سرّي سيرفضه
      معالجُنا ويملأ السجلّ ضجيجًا — فطريقُ إشعارٍ واحدٌ أوضح من اثنين.

   ⚠️ و`metadata` **مفاتيحها وقيمها نصوص** — تُمرَّر نصًّا صراحةً.
   ============================================================ */
async function createInvoice(opts) {
  const payload = {
    amount: opts.amount,              // ⚠️ بالهللات
    currency: opts.currency || "SAR",
    description: opts.description,
    success_url: opts.successUrl,
    back_url: opts.backUrl,
    metadata: stringifyMetadata(opts.metadata)
  };

  const data = await request("/invoices", opts.secretKey, payload);

  const url = data && (data.url || data.invoice_url);
  if (!url) throw apiError(200, "ردٌّ بلا رابط دفع: " + JSON.stringify(data).slice(0, 400));

  return { id: (data && data.id) || null, url: url, raw: data };
}

/* كل قيمةٍ نصًّا — ولا قيمةَ فارغةٍ تُمرَّر */
function stringifyMetadata(meta) {
  const out = {};
  Object.keys(meta || {}).forEach(function (k) {
    const v = meta[k];
    if (v === null || v === undefined) return;
    out[String(k)] = String(v);
  });
  return out;
}

module.exports = { API_BASE, createInvoice, stringifyMetadata };
