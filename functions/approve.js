"use strict";

/* ============================================================
   متوازي · دالّة اعتماد جدول العميل بنقرة من بريد الأخصائي
   ============================================================
   GET  ⇒ تعرض بطاقة تأكيد سريعة (تحمي من الفتح التلقائي لبرامج البريد،
          وتسمح للأخصائي بتعديل هدف السعرات قبل الاعتماد إن رغب).
   POST ⇒ تتحقّق من توقيع HMAC وتعتمد الجدول (status = "approved").
   ============================================================ */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const cfg = require("./config");
const { escHtml, verifyApprovalToken, getOrCreateApprovalSecret, toWhatsAppUrl } = require("./notify");

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)} — متوازي</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { margin:0; padding:24px 16px; background:#f8fafc; font-family:'Tajawal',sans-serif; color:#0f172a; }
    .card { max-width:480px; margin:24px auto; background:#fff; border:1px solid #e2e8f0; border-radius:18px; padding:26px 22px; box-shadow:0 8px 24px rgba(15,23,42,0.06); }
    h1 { font-size:1.35rem; margin:0 0 10px; color:#0f766e; }
    p { line-height:1.6; color:#475569; margin:0 0 14px; }
    label { display:block; font-weight:800; margin:14px 0 6px; font-size:0.92rem; }
    input[type="number"] { width:100%; box-sizing:border-box; padding:11px 14px; border:1.5px solid #cbd5e1; border-radius:10px; font-size:1.1rem; font-family:inherit; font-weight:800; direction:ltr; text-align:center; }
    .btn { display:block; width:100%; box-sizing:border-box; text-align:center; background:#0f766e; color:#fff; border:none; border-radius:999px; padding:13px 20px; font-size:1rem; font-weight:800; font-family:inherit; cursor:pointer; text-decoration:none; margin-top:16px; }
    .btn-wa { background:#16a34a; margin-top:10px; }
    .pill { display:inline-block; background:#f0fdfa; border:1px solid #99f6e4; color:#115e59; padding:4px 12px; border-radius:999px; font-size:0.84rem; font-weight:800; margin-bottom:12px; }
  </style>
</head>
<body><div class="card">${bodyHtml}</div></body>
</html>`;
}

exports.approvePlan = onRequest(
  {
    region: cfg.REGION,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 20
  },
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    const uid = String((req.method === "POST" ? req.body && req.body.uid : req.query.uid) || "").trim();
    const sig = String((req.method === "POST" ? req.body && req.body.sig : req.query.sig) || "").trim();

    if (!uid || !sig) {
      res.status(400).send(renderPage("رابط غير مكتمل", "<h1>⚠️ الرابط غير مكتمل</h1><p>تأكد من فتح الرابط الكامل من رسالة البريد الإلكتروني.</p>"));
      return;
    }

    const db = getFirestore();
    const secret = await getOrCreateApprovalSecret(db);
    if (!verifyApprovalToken(uid, sig, secret)) {
      logger.warn("محاولة اعتماد بتوقيع غير صالح", { uid: uid });
      res.status(403).send(renderPage("غير مصرح", "<h1>🔒 توقيع الرابط غير صالح</h1><p>لا يمكن تنفيذ هذا الإجراء.</p>"));
      return;
    }

    const profileRef = db.collection("profiles").doc(uid);
    const snap = await profileRef.get();
    if (!snap.exists) {
      res.status(404).send(renderPage("غير موجود", "<h1>لم يُعثر على استمارة العميل</h1><p>المعرّف المطلوب غير موجود في قاعدة البيانات.</p>"));
      return;
    }

    const data = snap.data() || {};
    const a = data.answers || {};
    const currentKcal = (data.calc && data.calc.kcal) || 1800;

    if (req.method === "GET") {
      const already = data.status === "approved" || data.status === "delivered";
      res.status(200).send(renderPage("مراجعة واعتماد الجدول", `
        <span class="pill">${already ? "معتمد مسبقاً ✓" : "بانتظار الاعتماد"}</span>
        <h1>اعتماد جدول: ${escHtml(a.name || "العميل")}</h1>
        <p>الوزن الحالي: <b>${escHtml(a.weightKg)} كجم</b> · الطول: <b>${escHtml(a.heightCm)} سم</b> · العمر: <b>${escHtml(a.age)} سنة</b></p>
        <form method="POST" action="">
          <input type="hidden" name="uid" value="${escHtml(uid)}">
          <input type="hidden" name="sig" value="${escHtml(sig)}">
          <label for="kcal">هدف السعرات اليومي المعتمد (يمكنك تعديله قبل الاعتماد):</label>
          <input id="kcal" name="kcal" type="number" min="1000" max="4500" step="10" value="${escHtml(currentKcal)}" required>
          <button type="submit" class="btn">✅ تأكيد الاعتماد وتفعيل الجدول الآن</button>
        </form>
      `));
      return;
    }

    if (req.method === "POST") {
      const rawKcal = Number(req.body && req.body.kcal);
      const finalKcal = (Number.isFinite(rawKcal) && rawKcal >= 1000 && rawKcal <= 4500)
        ? Math.round(rawKcal)
        : currentKcal;

      const patch = {
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      if (data.calc && finalKcal !== currentKcal) {
        const ratio = finalKcal / (currentKcal || 1800);
        patch.calc = Object.assign({}, data.calc, {
          kcal: finalKcal,
          macros: {
            protein: Math.round(((data.calc.macros && data.calc.macros.protein) || 110) * ratio),
            carbs: Math.round(((data.calc.macros && data.calc.macros.carbs) || 180) * ratio),
            fat: Math.round(((data.calc.macros && data.calc.macros.fat) || 60) * ratio)
          }
        });
      }

      await profileRef.set(patch, { merge: true });
      logger.info("تم اعتماد جدول العميل", { uid: uid, kcal: finalKcal });

      const waNotifyUrl = a.phone ? (() => {
        const base = toWhatsAppUrl(a.phone, a.country, a.name).split("?")[0];
        const msg = "أهلاً " + (a.name || "بك") + " 🌟\nتم مراجعة واعتماد جدولك الغذائي والرياضي في منصة متوازي! يمكنك تصفحه الآن مباشرة من حسابك:\nhttps://motawazi.com/plan";
        return base + "?text=" + encodeURIComponent(msg);
      })() : "";

      res.status(200).send(renderPage("تم الاعتماد بنجاح", `
        <span class="pill">تم التفعيل بنجاح ✓</span>
        <h1>🎉 تم اعتماد وتفعيل جدول ${escHtml(a.name || "العميل")}!</h1>
        <p>الجدول مفتوح الآن في حساب العميل بهدف يومي قدره <b>${escHtml(finalKcal)} سعرة</b>.</p>
        ${waNotifyUrl ? `<a class="btn btn-wa" href="${escHtml(waNotifyUrl)}">💬 إرسال بشارة التفعيل للعميل عبر واتساب</a>` : ""}
      `));
      return;
    }

    res.status(405).send("Method Not Allowed");
  }
);
