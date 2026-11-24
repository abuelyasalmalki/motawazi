"use strict";

/* ============================================================
   متوازي · إشعارات الاستمارة ورابط الاعتماد المشفّر للأخصائي
   ============================================================
   يرسل ملخص الاستمارة الصحية لبريد الإدارة/الأخصائي فور إرسالها،
   مرفقاً بزر مراسلة العميل على واتساب وزر اعتماد مشفّر بـHMAC-SHA256.
   ============================================================ */

const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");

const DIAL_CODES = Object.freeze({
  SA: "966", AE: "971", KW: "965", QA: "974", BH: "973", OM: "968",
  EG: "20", JO: "962", IQ: "964", LB: "961", SY: "963", PS: "970",
  YE: "967", LY: "218", TN: "216", DZ: "213", MA: "212", SD: "249",
  MR: "222", DJ: "253", SO: "252", KM: "269"
});

const LABELS = Object.freeze({
  sex: { male: "ذكر", female: "أنثى" },
  goal: { lose: "نزول الوزن", maintain: "المحافظة على الوزن" },
  pace: { slow: "هادئ", moderate: "متوسط", faster: "أسرع" },
  activity: { sedentary: "خامل", light: "خفيف", moderate: "متوسط", high: "عالي" },
  reasons: {
    diabetes: "السكري",
    hypertension: "الضغط",
    heart: "أمراض القلب",
    kidneyLiver: "أمراض الكلى أو الكبد",
    pregnancy: "حمل أو رضاعة",
    surgery: "عملية سابقة (تكميم ونحوه)",
    eatingDisorder: "اضطرابات الأكل",
    medications: "يستخدم أدوية حالياً",
    minor: "قاصر (ولي أمر)",
    bmi_low: "مؤشر كتلة الجسم منخفض",
    bmi_high: "مؤشر كتلة الجسم مرتفع (≥35)",
    target_bmi_low: "الوزن المستهدف بمؤشر منخفض"
  }
});

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* تحويل رقم الجوال إلى رابط واتساب دولي جاهز للمراسلة بضغطة واحدة */
function toWhatsAppUrl(phone, countryCode, clientName) {
  let digits = String(phone || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const cc = DIAL_CODES[countryCode] || "966";
    if (digits.startsWith("0")) {
      digits = cc + digits.slice(1);
    } else if (!digits.startsWith(cc) && digits.length <= 10) {
      digits = cc + digits;
    }
  }
  const msg = "أهلاً " + (clientName || "بك") + "، معك فريق متوازي بخصوص استمارتك الصحية وجدولك المتوازي 🌿";
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(msg);
}

/* توقيع وتثبّت آمن زمنيًّا لرابط اعتماد جدول العميل */
function signApprovalToken(uid, secret) {
  if (!uid || !secret) throw new Error("missing uid or secret");
  return createHmac("sha256", String(secret))
    .update("approve:v1:" + String(uid))
    .digest("hex");
}

function verifyApprovalToken(uid, sig, secret) {
  if (!uid || !sig || !secret) return false;
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(signApprovalToken(uid, secret), "hex");
  const received = Buffer.from(sig, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/* مفتاح التوقيع يُحفظ تلقائياً في وثيقة داخلية محظورة تماماً على المتصفح */
async function getOrCreateApprovalSecret(db) {
  const ref = db.collection("_internal").doc("approvalKey");
  let secret = "";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data() && snap.data().secret) {
      secret = snap.data().secret;
    } else {
      secret = randomBytes(32).toString("hex");
      tx.set(ref, { secret: secret, createdAt: new Date().toISOString() });
    }
  });
  return secret;
}

function buildIntakeEmailHtml(opts) {
  const a = opts.answers || {};
  const calc = opts.calc || {};
  const tri = opts.triage || { flagged: false, reasons: [] };
  const macros = calc.macros || {};
  const h = a.health || {};

  const flagBadges = (tri.reasons || []).map((r) => LABELS.reasons[r] || r).join(" · ");
  const statusBanner = tri.flagged
    ? `<div style="background:#fff7ed;border:1.5px solid #fed7aa;color:#9a3412;padding:12px 14px;border-radius:10px;margin-bottom:16px;font-weight:700;">
         ⚠️ حالة تحتاج انتباه الأخصائي: ${escHtml(flagBadges)}
       </div>`
    : `<div style="background:#f0fdfa;border:1.5px solid #99f6e4;color:#115e59;padding:12px 14px;border-radius:10px;margin-bottom:16px;font-weight:700;">
         ✅ الفرز الصحي سليم (لا توجد موانع صحية مسجلة)
       </div>`;

  const yesList = [];
  if (h.diabetes) yesList.push("السكري");
  if (h.hypertension) yesList.push("الضغط");
  if (h.heart) yesList.push("القلب");
  if (h.kidneyLiver) yesList.push("الكلى/الكبد");
  if (h.pregnancy) yesList.push("حمل/رضاعة");
  if (h.surgery) yesList.push("عملية سابقة" + (a.surgeryNote ? " (" + a.surgeryNote + ")" : ""));
  if (h.eatingDisorder) yesList.push("اضطراب أكل");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:20px;background:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;direction:rtl;text-align:right;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">
    <h2 style="margin:0 0 6px;color:#0f766e;font-size:20px;">📋 استمارة عميل جديدة — متوازي</h2>
    <p style="margin:0 0 18px;color:#64748b;font-size:13px;">معرّف الحساب: <code dir="ltr">${escHtml(opts.uid)}</code></p>

    ${statusBanner}

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px;">
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;width:36%;">الاسم الكريم</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:700;">${escHtml(a.name || "—")}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">رقم الواتساب</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:700;" dir="ltr">${escHtml(a.phone || "—")}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">البريد الإلكتروني</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;" dir="ltr">${escHtml(opts.email || "—")}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الدولة · الجنس · العمر</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escHtml(opts.countryName || a.country)} · ${escHtml(LABELS.sex[a.sex] || a.sex)} · ${escHtml(a.age)} سنة</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الطول والوزن الحالي</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:700;">${escHtml(a.heightCm)} سم · ${escHtml(a.weightKg)} كجم (BMI: ${escHtml(calc.bmi)})</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الهدف والوزن المستهدف</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escHtml(LABELS.goal[a.goal] || a.goal)}${a.targetKg ? " ← " + escHtml(a.targetKg) + " كجم (" + escHtml(LABELS.pace[a.pace] || "") + ")" : ""}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">النشاط اليومي</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escHtml(LABELS.activity[a.activity] || a.activity)}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الحالات الصحية</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${yesList.length ? escHtml(yesList.join("، ")) : "لا يوجد"}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الأدوية</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${a.medications && a.medications.has ? escHtml(a.medications.text) : "لا"}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">الحساسية الغذائية</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${a.allergies && a.allergies.has ? escHtml(a.allergies.text) : "لا"}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;">أكلات غير مفضلة / نباتي</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escHtml(a.dislikes || "—")} · نباتي: ${a.vegetarian ? "نعم" : "لا"}</td></tr>
    </table>

    <div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:12px;padding:14px;margin-bottom:20px;text-align:center;">
      <div style="font-size:13px;color:#115e59;font-weight:700;">السعرات التقديرية المحسوبة</div>
      <div style="font-size:26px;font-weight:900;color:#0f766e;margin:4px 0;">${escHtml(calc.kcal)} سعرة / يوم</div>
      <div style="font-size:13px;color:#334155;">بروتين: <b>${escHtml(macros.protein)} جم</b> · كارب: <b>${escHtml(macros.carbs)} جم</b> · دهون: <b>${escHtml(macros.fat)} جم</b></div>
    </div>

    <div style="text-align:center;margin-top:18px;">
      ${opts.approveUrl ? `<a href="${escHtml(opts.approveUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:12px 24px;border-radius:999px;margin:6px;">✅ مراجعة واعتماد جدول العميل</a>` : ""}
      ${opts.whatsappUrl ? `<a href="${escHtml(opts.whatsappUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:999px;margin:6px;">💬 مراسلة العميل على واتساب</a>` : ""}
    </div>
  </div>
</body>
</html>`;
}

async function sendResendEmail({ apiKey, from, to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: from || "متوازي <onboarding@resend.dev>",
      to: [to],
      subject: subject,
      html: html
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Resend HTTP " + res.status + ": " + body.slice(0, 200));
  }
  return res.json();
}

module.exports = {
  DIAL_CODES,
  LABELS,
  escHtml,
  toWhatsAppUrl,
  signApprovalToken,
  verifyApprovalToken,
  getOrCreateApprovalSecret,
  buildIntakeEmailHtml,
  sendResendEmail
};
