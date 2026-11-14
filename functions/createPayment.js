"use strict";

/* ============================================================
   متوازي · دالّة إنشاء الدفع
   ============================================================
   تستقبل من المتصفّح `plan` **وحده**. المبلغ والمدّة يُشتقّان في الخادم من
   جدول الباقات (plans.js) — ولو وثِقنا بما يرسله المتصفّح لاشترى العميل
   بريالٍ واحد.

   الترتيب ملزم: تُنشأ وثيقة الطلب **قبل** نداء ميسر، فالويب-هوك يجدها لا
   يخترعها.

   ⚠️ و`given_id` غير مدعومٍ في فواتير ميسر، فحماية الخصم المضاعف بديلُها
   هنا: **إعادة استعمال الطلب المعلّق الطازج** — العميل الذي يضغط «اشترك»
   مرّتين يعود إلى **نفس الفاتورة** لا إلى ثانية.
   ============================================================ */

const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const { resolvePlan, isSellable } = require("./plans");
const cfg = require("./config");
const { createInvoice } = require("./moyasar");

/* أحدث طلبٍ معلّقٍ طازجٍ لنفس العميل ونفس الباقة، وله رابط فاتورةٍ حيّ.
   يستعمل الفهرس المركّب (uid تصاعدي، createdAt تنازلي) — firestore.indexes.json. */
async function findReusable(db, uid, plan) {
  const cutoff = Date.now() - cfg.REUSE_WINDOW_MS;
  const snap = await db
    .collection("orders")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const o = doc.data();
    if (o.status !== "pending" || o.plan !== plan || !o.invoiceUrl) continue;
    const ms = o.createdAt && typeof o.createdAt.toMillis === "function"
      ? o.createdAt.toMillis()
      : 0;
    if (ms >= cutoff) return { orderId: doc.id, url: o.invoiceUrl };
  }
  return null;
}

exports.createPayment = onCall(
  {
    region: cfg.REGION,
    cors: cfg.ORIGINS,
    secrets: [cfg.MOYASAR_SECRET_KEY],
    maxInstances: 10,
    timeoutSeconds: 30
  },
  async (req) => {
    /* ١ — العميل مسجَّل؟ */
    const uid = req.auth && req.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "سجّل دخولك أولًا ثم أعِد المحاولة.");
    }

    const data = req.data || {};

    /* ⚠️ مبلغٌ أو مدّةٌ من العميل: غير مقروءَين أصلًا — لا يُشتقّ منهما شيء.
       ونسجّلهما لأن وجودهما محاولةُ عبثٍ لا خطأً بريئًا، والسجلّ يكشفها. */
    if ("amount" in data || "days" in data || "price" in data) {
      logger.warn("محاولة تمرير مبلغ/مدّة من العميل — مُتجاهَلة", {
        uid: uid,
        keys: Object.keys(data)
      });
    }

    /* ٢ — الاشتقاق في الخادم حصرًا */
    const p = resolvePlan(data.plan);
    if (!p) {
      logger.warn("باقة غير معروفة", { uid: uid, plan: String(data.plan).slice(0, 40) });
      throw new HttpsError("invalid-argument", "باقة غير معروفة.");
    }

    /* الباقة معروفة لكن سعرها لم يُحدَّد بعد ⇒ لا فاتورة إطلاقًا */
    if (!isSellable(p)) {
      logger.warn("باقة غير قابلة للبيع (سعر/مدّة غير محدّدة)", { uid: uid, plan: p.plan });
      throw new HttpsError("failed-precondition", "هذي الباقة غير متاحة للاشتراك بعد.");
    }

    const db = admin.firestore();

    /* ٣ — ضغطةٌ ثانية خلال النافذة ⇒ نفس الفاتورة لا فاتورةٌ ثانية.
       فشلُ الاستعلام لا يمنع الشراء: نسجّله ونمضي إلى فاتورةٍ جديدة. */
    try {
      const reuse = await findReusable(db, uid, p.plan);
      if (reuse) {
        logger.info("إعادة استعمال طلبٍ معلّق", { orderId: reuse.orderId, uid: uid, plan: p.plan });
        return { orderId: reuse.orderId, url: reuse.url, reused: true };
      }
    } catch (e) {
      logger.warn("تعذّر البحث عن طلبٍ معلّق — نمضي بإنشاء طلبٍ جديد", {
        uid: uid,
        err: String((e && e.message) || e)
      });
    }

    /* ٤ — معرّف طلبنا. لم يعد معرّف العملية عند ميسر — بل يُمرَّر في
       `metadata` وهي طريق الربط الوحيد بين الويب-هوك ووثيقتنا. */
    const orderId = randomUUID();
    const ref = db.collection("orders").doc(orderId);

    /* ٥ — الوثيقة أوّلًا، بحالة الانتظار وحارس التكرار مضبوطًا صراحةً.
       `applied: false` تُكتب ولا تُترك غائبة: الحارس يُقرأ لا يُستنتج. */
    await ref.set({
      uid: uid,
      plan: p.plan,
      days: p.days,
      amount: p.amount,
      status: "pending",
      applied: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    /* ٦ — نداء ميسر */
    const site = cfg.siteOrigin();
    let inv;
    try {
      inv = await createInvoice({
        secretKey: cfg.MOYASAR_SECRET_KEY.value(),
        amount: p.amount,
        description: "اشتراك متوازي — باقة " + p.label,
        successUrl: site + cfg.RETURN_PATH + "?order=" + encodeURIComponent(orderId),
        backUrl: site + cfg.BACK_PATH,
        metadata: { orderId: orderId, uid: uid, plan: p.plan }
      });
    } catch (e) {
      /* الطلب يبقى `pending` — ولم يصل بوّابةً أصلًا، فلا ويب-هوك يأتيه.
         و«لم تكتمل» في سجلّ العمليات وصفٌ صادقٌ لهذي الحالة بعينها.
         ولا `invoiceUrl` فيه، فلا يُعاد استعماله في الضغطة التالية. */
      logger.error("تعذّر إنشاء الفاتورة عند ميسر", {
        orderId: orderId,
        uid: uid,
        plan: p.plan,
        err: String((e && e.message) || e)
      });
      throw new HttpsError("internal", "تعذّر فتح صفحة الدفع، حاول بعد قليل.");
    }

    /* ٧ — معرّف الفاتورة ورابطها في الوثيقة.
       ⚠️ الرابط ليس زينة: هو ما يجعل الضغطة الثانية تعود إلى نفس الفاتورة.
       وفشلُ هذي الكتابة يعني أن الضغطة التالية ستفتح فاتورةً ثانية —
       فيُسجَّل تحذيرًا لا يُبتلع. */
    try {
      await ref.set({ invoiceId: inv.id || null, invoiceUrl: inv.url }, { merge: true });
    } catch (e) {
      logger.warn("تعذّر حفظ بيانات الفاتورة — حماية الضغطة المكرّرة معطّلة لهذا الطلب", {
        orderId: orderId,
        err: String((e && e.message) || e)
      });
    }

    logger.info("طلبٌ أُنشئ", {
      orderId: orderId,
      uid: uid,
      plan: p.plan,
      amount: p.amount,
      invoiceId: inv.id || null
    });

    /* ٨ — رابط الدفع إلى المتصفّح */
    return { orderId: orderId, url: inv.url, reused: false };
  }
);
