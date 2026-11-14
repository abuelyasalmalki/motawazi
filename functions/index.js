"use strict";

/* ============================================================
   متوازي · الدوال — نقطة الدخول
   ============================================================
   createPayment  — إنشاء فاتورة ميسر لباقةٍ مختارة.
   moyasarWebhook — استقبال حدث الدفع وتفعيل الاشتراك.
   submitIntake   — الاستمارة الصحية: تحقّق، حساب السعرات، فرز، حفظ.

   🔴 لا مفتاح حقيقيّ في المستودع. الأسرار في Secret Manager —
      انظر functions/README.md.
   ============================================================ */

const admin = require("firebase-admin");

admin.initializeApp();

exports.createPayment = require("./createPayment").createPayment;
exports.moyasarWebhook = require("./webhook").moyasarWebhook;
exports.submitIntake = require("./intake").submitIntake;
