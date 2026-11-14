"use strict";

/* ============================================================
   متوازي · ويب-هوك ميسر 🔴
   ============================================================
   أخطر ملفٍّ في المشروع: هنا يُكتب `subscribed`، وهنا وحده.

   الترتيب:
     ١. تحقّق من `secret_token` بمقارنةٍ آمنةٍ زمنيًّا.
     ٢. طابِق الوضع (`live`) بوضع المفتاح.
     ٣. عالِج، ثم أجب.

   ⚠️ **انحرافٌ واعٍ عن «أرجِع 200 قبل أي منطق»** — والسبب:
   شيفرة ‎2xx تُخبر ميسر «تسلّمتُ وعالجت»، فتُلغي الإعاداتِ الستّ. وفي
   Cloud Functions **لا يُضمَن تنفيذ عملٍ بعد إرسال الردّ** — يُخنق المعالج
   ويُطوى. فالجمع بين الاثنين يصنع أسوأ عطبٍ ممكن: العميل دفع، والمعالجة
   ماتت بعد الردّ، **ولا إعادةَ تُنقذه** لأننا قلنا «تمّ».

   وتوجيه ميسر نفسُه معلَّل: «قبل أي منطقٍ **قد يسبّب انتهاء مهلة**».
   ومنطقنا قراءةٌ ومعاملة — عشراتُ ميلي‑ثانية، لا مهلةَ تنتهي. فنحن نحفظ
   **علّة** التوجيه لا حرفَه، ونبقي شبكةَ الأمان معلّقة.

   وعليه تنقسم الردود:
     ‎2xx ← نتيجةٌ نهائية (نجح · رُفض · مكرَّر) — لا تُعِد، فالإعادة لن تغيّر شيئًا.
     ‎5xx ← عطلٌ عابر (Firestore متعذّرة) — **أعِد**، والحارس `applied` يجعل
            الإعادة آمنة.
     ‎401 ← رمزٌ سرّي خاطئ. ولا تُجاب بـ200 أبدًا: المزوَّرة لا تُشكَر.
   ============================================================ */

const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const cfg = require("./config");
/* القرارات الحسّاسة في وحدةٍ نقيّة مُختبَرة — انظر functions/test.js */
const {
  safeEqual, orderKeys, toMillis, nextSubEndsMs, decidePaid, decideFailed
} = require("./verify");

/* ============================================================
   العثور على وثيقة الطلب — بالمرشّحات مرتَّبةً
   ============================================================
   ⚠️ مرشّح `invoice_id` يُبحَث **بالاستعلام على حقل `invoiceId`** لا بقراءة
   `orders/{invoice_id}`: معرّف الوثيقة `uuid` نولّده، ومعرّف الفاتورة تولّده
   ميسر — فالقراءة المباشرة به لا تجد شيئًا أبدًا.
   والاستعلام يخدمه فهرس الحقل المفرد التلقائي — بلا فهرسٍ مركّب.

   ويقع كلُّه **داخل المعاملة**، فالوثيقة التي نقرؤها هي التي نكتبها. */
async function findOrder(tx, db, keys) {
  for (const k of keys) {
    if (k.by === "metadata") {
      const ref = db.collection("orders").doc(k.value);
      const snap = await tx.get(ref);
      if (snap.exists) return { ref: ref, data: snap.data(), by: k.by };
    } else {
      const qs = await tx.get(
        db.collection("orders").where("invoiceId", "==", k.value).limit(1)
      );
      if (!qs.empty) return { ref: qs.docs[0].ref, data: qs.docs[0].data(), by: k.by };
    }
  }
  return null;
}

/* جسمُ الطلب — كائنًا كان أو نصًّا */
function parseBody(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  const raw = Buffer.isBuffer(b) ? b.toString("utf8")
            : (typeof b === "string" ? b
            : (req.rawBody ? req.rawBody.toString("utf8") : ""));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/* نهاياتُ الطلب — وكلُّ رفضٍ يُسجَّل بسببه، فالتشخيص من السجلّ لا من التخمين */
function ok(res, reason, fields) {
  logger.info("ويب-هوك · " + reason, fields || {});
  res.status(200).send("ok");
}
function skip(res, reason, fields) {
  logger.warn("ويب-هوك · " + reason, fields || {});
  res.status(200).send("ok");   // نهائيّ: الإعادة لن تغيّره
}
function retry(res, reason, fields) {
  logger.error("ويب-هوك · " + reason + " — نطلب الإعادة", fields || {});
  res.status(500).send("retry");
}

/* ============================================================
   payment_paid
   ============================================================ */
async function handlePaid(res, event, data) {
  const keys = orderKeys(data);
  const eventId = event.id;

  if (!keys.length) {
    return skip(res, "لا معرّف ربطٍ في الحدث — لا invoice_id ولا metadata.orderId", {
      eventId: eventId, paymentId: data.id
    });
  }
  if (String(data.status || "") !== "paid") {
    return skip(res, "حالة الدفع ليست paid", {
      eventId: eventId, invoiceId: data.invoice_id, status: data.status
    });
  }

  const db = admin.firestore();
  let outcome = "";
  let detail = {};
  let orderId = null;

  try {
    await db.runTransaction(async (tx) => {
      outcome = "";
      detail = {};
      orderId = null;

      /* كل القراءات قبل كل الكتابات — شرط معاملات Firestore.
         والقراءة **داخل** المعاملة لا قبلها — وإلا عبرت رسالتان معًا. */
      const found = await findOrder(tx, db, keys);
      const o = found ? found.data : null;
      const ref = found ? found.ref : null;
      if (found) { orderId = found.ref.id; detail.matchedBy = found.by; }

      /* سُلّم الرفض كاملًا في وحدةٍ نقيّة مُختبَرة — verify.js */
      const verdict = decidePaid(o, data);
      if (!verdict.ok) {
        outcome = verdict.reason;
        detail = Object.assign(detail, verdict.detail || {});
        return;
      }

      const userRef = db.collection("users").doc(String(o.uid));
      const userSnap = await tx.get(userRef);

      /* ⚠️ ساعة الخادم لا ساعة الجهاز.
         و`serverTimestamp()` رمزٌ لا يُجمع عليه — فالحساب بـTimestamp.now()
         ثم fromMillis، والرمز يبقى لـ`paidAt` وحده. */
      const now = admin.firestore.Timestamp.now();
      const curMs = userSnap.exists ? toMillis(userSnap.get("subEndsAt")) : 0;
      const subEndsAt = admin.firestore.Timestamp.fromMillis(
        nextSubEndsMs(curMs, now.toMillis(), Number(o.days))
      );

      const orderPatch = {
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        applied: true,
        moyasarId: String(data.id || ""),
        live: Boolean(event.live)
      };
      /* إن ضاعت كتابةُ معرّف الفاتورة وقت الإنشاء، نستدركها الآن */
      if (!o.invoiceId && data.invoice_id) orderPatch.invoiceId = String(data.invoice_id);

      tx.set(ref, orderPatch, { merge: true });
      /* 🔴 الموضع الوحيد في المشروع كلّه الذي يُكتب فيه `subscribed` و`subEndsAt` و`plan`. */
      tx.set(userRef, {
        subscribed: true,
        subEndsAt: subEndsAt,
        plan: String(o.plan || "")
      }, { merge: true });

      outcome = "فُعِّل";
      detail = Object.assign(detail, {
        uid: o.uid,
        days: o.days,
        extended: curMs > now.toMillis(),   // تمديدٌ لسارٍ أم بدءٌ من الآن
        subEndsAt: subEndsAt.toDate().toISOString()
      });
    });
  } catch (e) {
    return retry(res, "فشلت معاملة التفعيل", {
      eventId: eventId, invoiceId: data.invoice_id, err: String((e && e.message) || e)
    });
  }

  const fields = Object.assign(
    { eventId: eventId, orderId: orderId, invoiceId: data.invoice_id },
    detail
  );
  return outcome === "فُعِّل" ? ok(res, outcome, fields) : skip(res, outcome, fields);
}

/* ============================================================
   payment_faild  ⚠️ هكذا بالضبط في توثيقهم — خطأٌ إملائيّ عندهم،
   يُكتب كما هو لا كما ينبغي، وإلا لم يُلتقط الحدث أصلًا.
   ============================================================ */
async function handleFailed(res, event, data) {
  const keys = orderKeys(data);
  const eventId = event.id;

  if (!keys.length) {
    return skip(res, "فشلٌ بلا معرّف ربط", { eventId: eventId, paymentId: data.id });
  }

  const db = admin.firestore();
  let outcome = "";
  let orderId = null;

  try {
    await db.runTransaction(async (tx) => {
      outcome = "";
      orderId = null;

      const found = await findOrder(tx, db, keys);
      const o = found ? found.data : null;
      if (found) orderId = found.ref.id;

      const verdict = decideFailed(o);
      if (!verdict.ok) { outcome = verdict.reason; return; }

      tx.set(found.ref, {
        status: "failed",
        moyasarId: String(data.id || ""),
        live: Boolean(event.live)
      }, { merge: true });

      outcome = "فشلٌ مسجَّل";
    });
  } catch (e) {
    return retry(res, "فشلت معاملة تسجيل الفشل", {
      eventId: eventId, invoiceId: data.invoice_id, err: String((e && e.message) || e)
    });
  }

  /* 🔴 ولا كتابةَ على `users` في هذا المسار إطلاقًا — الاشتراك لم يُمسّ. */
  return skip(res, outcome, {
    eventId: eventId, orderId: orderId, invoiceId: data.invoice_id
  });
}

/* ============================================================ */
exports.moyasarWebhook = onRequest(
  {
    region: cfg.REGION,
    secrets: [cfg.MOYASAR_WEBHOOK_TOKEN, cfg.MOYASAR_SECRET_KEY],
    cors: false,          // خادمٌ إلى خادم — لا متصفّح
    maxInstances: 10,
    timeoutSeconds: 60
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }

    const body = parseBody(req);
    if (!body) {
      logger.warn("ويب-هوك · جسمٌ غير قابل للتفكيك");
      res.status(400).send("bad request");
      return;
    }

    /* ١ — الرمز السرّي. أوّلَ شيءٍ وقبل كل شيء. */
    const expected = cfg.MOYASAR_WEBHOOK_TOKEN.value();
    if (!expected) {
      /* خطأُ إعدادٍ لا خطأُ رسالة: نطلب الإعادة فلا تضيع رسالةٌ صحيحة
         بينما نضبط الرمز. */
      return retry(res, "MOYASAR_WEBHOOK_TOKEN غير مضبوط", {});
    }
    if (!safeEqual(body.secret_token, expected)) {
      logger.error("ويب-هوك · رمزٌ سرّي خاطئ — رُفضت الرسالة", {
        eventId: body.id, type: body.type
      });
      res.status(401).send("unauthorized");
      return;
    }

    const type = String(body.type || "");
    const data = (body.data && typeof body.data === "object") ? body.data : {};

    /* ٢ — الوضع: `live` الحدث يطابق وضع المفتاح؟
       ⚠️ رسالةُ اختبارٍ لا تُفعِّل اشتراكًا حقيقيًّا، والعكس. */
    const expectLive = cfg.isLiveKey(cfg.MOYASAR_SECRET_KEY.value());
    if (Boolean(body.live) !== expectLive) {
      return skip(res, "وضعٌ مخالف — لا تفعيل", {
        eventId: body.id, type: type,
        eventLive: Boolean(body.live), expectLive: expectLive
      });
    }

    /* ٣ — المعالجة */
    if (type === "payment_paid")  return handlePaid(res, body, data);
    if (type === "payment_faild") return handleFailed(res, body, data);

    return skip(res, "حدثٌ غير معالَج", { eventId: body.id, type: type });
  }
);
