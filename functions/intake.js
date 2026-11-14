"use strict";

/* ============================================================
   متوازي · دالّة إرسال الاستمارة الصحية — submitIntake
   ============================================================
   المتصفح يرسل **الإجابات فقط**. هنا وحده:
     ١. التحقّق (قائمة سماح — nutrition.js)
     ٢. حساب السعرات (nutrition.config.json)
     ٣. الفرز الصحي
     ٤. كتابة profiles/{uid} وأول قراءة وزن — في معاملةٍ واحدة.
   فالعميل لا يستطيع أن يكتب سعراته ولا حالة المراجعة (firestore.rules
   تمنع أي كتابةٍ من المتصفح على هذين المسارين).
   ============================================================ */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const cfg = require("./config");
const N = require("./nutrition");
const NCFG = require("./nutrition.config.json");
const COUNTRY_CODES = require("./countries.json").map((c) => c.code);

/* إعدادٌ خاطئ ⇒ تفشل الدالّة عند التحميل، فيفشل النشر — لا أرقام خاطئة بصمت */
const cfgErrors = N.validateConfig(NCFG);
if (cfgErrors.length) {
  throw new Error("nutrition.config.json غير صالح: " + cfgErrors.join("، "));
}

/* نسخة نصّ الشروط والخصوصية التي وافق عليها العميل — حدّثها مع أي تعديل
   على terms.html أو privacy.html */
const CONSENT_VERSION = "draft-2026-11";

/* الطلب يُعاد إرساله (تعديل الإجابات) ما دام لم تبدأ مراجعته */
const EDITABLE_STATUSES = ["received"];

exports.submitIntake = onCall(
  {
    region: cfg.REGION,
    cors: cfg.ORIGINS,
    maxInstances: 10,
    timeoutSeconds: 30
  },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "سجّل دخولك أولاً.");

    const v = N.validateAnswers(req.data && req.data.answers, NCFG, COUNTRY_CODES);

    if (v.errors.indexOf("age_not_eligible") >= 0) {
      throw new HttpsError("failed-precondition", "الخدمة حالياً للبالغين.", { code: "age_not_eligible" });
    }
    if (!v.ok) {
      logger.info("استمارة غير مكتملة", { uid: uid, errors: v.errors });
      throw new HttpsError("invalid-argument", "بعض الإجابات ناقصة أو غير صحيحة.", { errors: v.errors });
    }

    const a = v.answers;
    const calc = N.computeCalc(a, NCFG);
    const tri = N.triage(a, calc, NCFG, v.eligibility);

    const db = getFirestore();
    const profileRef = db.collection("profiles").doc(uid);
    /* أول قراءة وزن بمعرّفٍ ثابت: إعادة الإرسال تحدّثها ولا تكرّرها */
    const weightRef = db.collection("weights").doc(uid).collection("entries").doc("intake");
    const now = FieldValue.serverTimestamp();

    let result;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      const prev = snap.exists ? snap.data() : null;
      if (prev && EDITABLE_STATUSES.indexOf(prev.status) < 0) {
        throw new HttpsError("failed-precondition",
          "طلبك قيد المراجعة — لتعديل بياناتك تواصل مع الأخصائي.", { code: "locked" });
      }

      const doc = {
        uid: uid,
        answers: a,
        calc: calc,
        triage: tri,
        status: "received",
        consent: {
          terms: true,
          health: true,
          version: CONSENT_VERSION,
          at: now
        },
        guardian: v.guardian,      // null للبالغين
        createdAt: prev && prev.createdAt ? prev.createdAt : now,
        updatedAt: now
      };
      /* استبدالٌ كامل لا دمج: فلا تبقى إجابةٌ قديمة عالقة من إرسالٍ سابق */
      tx.set(profileRef, doc);

      tx.set(weightRef, {
        weightKg: a.weightKg,
        source: "intake",
        date: now
      });

      result = { status: "received", flagged: tri.flagged };
    });

    logger.info("استمارة مستلمة", {
      uid: uid, flagged: tri.flagged, reasons: tri.reasons, configVersion: calc.configVersion
    });

    /* الردّ لا يحمل السعرات — الصفحة تقرؤها من الملف، وتخفيها إن كان معلّماً */
    return result;
  }
);
