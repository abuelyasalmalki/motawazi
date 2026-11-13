"use strict";

/* ============================================================
   متوازي · اختبارات قواعد Firestore (على المحاكي)
   ============================================================
   cd tests && npm install && npm test
   تحتاج Java (موجودة في GitHub Actions). تشتغل تلقائياً في CI.
   ============================================================ */

const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment, assertSucceeds, assertFails
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, Timestamp } =
  require("firebase/firestore");

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-motawazi",
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8") }
  });
});
after(async () => { if (env) await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { name: "Alice", subscribed: false });
    await setDoc(doc(db, "profiles/alice"), {
      uid: "alice", status: "received", calc: { kcal: 1800 }, triage: { flagged: false, reasons: [] }
    });
    await setDoc(doc(db, "weights/alice/entries/intake"), { weightKg: 80, source: "intake" });
    await setDoc(doc(db, "orders/o1"), { uid: "alice", status: "pending" });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const guest = () => env.unauthenticatedContext().firestore();

/* ===== الملف الصحي ===== */
test("العميل يقرأ ملفه الصحي", async () => {
  await assertSucceeds(getDoc(doc(alice(), "profiles/alice")));
});
test("🔴 عميل ثاني ما يقرأ ملف غيره", async () => {
  await assertFails(getDoc(doc(bob(), "profiles/alice")));
});
test("🔴 الزائر ما يقرأ أي ملف", async () => {
  await assertFails(getDoc(doc(guest(), "profiles/alice")));
});
test("🔴 العميل ما يعدّل سعراته", async () => {
  await assertFails(updateDoc(doc(alice(), "profiles/alice"), { "calc.kcal": 900 }));
});
test("🔴 العميل ما يعدّل حالة المراجعة ولا الفرز", async () => {
  await assertFails(updateDoc(doc(alice(), "profiles/alice"), { status: "approved" }));
  await assertFails(updateDoc(doc(alice(), "profiles/alice"), { "triage.flagged": false }));
});
test("🔴 العميل ما ينشئ ملفاً مباشرة (لازم عبر الدالّة)", async () => {
  await assertFails(setDoc(doc(bob(), "profiles/bob"), { status: "approved", calc: { kcal: 5000 } }));
});
test("العميل ما يحذف ملفه", async () => {
  await assertFails(deleteDoc(doc(alice(), "profiles/alice")));
});

/* ===== سجل الوزن ===== */
test("العميل يقرأ قراءات وزنه", async () => {
  await assertSucceeds(getDoc(doc(alice(), "weights/alice/entries/intake")));
  await assertSucceeds(getDocs(collection(alice(), "weights/alice/entries")));
});
test("🔴 عميل ثاني ما يقرأ أوزان غيره", async () => {
  await assertFails(getDoc(doc(bob(), "weights/alice/entries/intake")));
  await assertFails(getDocs(collection(bob(), "weights/alice/entries")));
});
test("الكتابة على الأوزان مقفلة حالياً", async () => {
  await assertFails(setDoc(doc(alice(), "weights/alice/entries/x"), { weightKg: 70 }));
  await assertFails(updateDoc(doc(alice(), "weights/alice/entries/intake"), { weightKg: 70 }));
});

/* ===== وثيقة المستخدم والاشتراك (المرحلة الأولى) ===== */
test("العميل يحدّث اسمه", async () => {
  await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { name: "A" }));
});
test("🔴 العميل ما يمنح نفسه اشتراكاً", async () => {
  await assertFails(updateDoc(doc(alice(), "users/alice"), { subscribed: true }));
  await assertFails(updateDoc(doc(alice(), "users/alice"),
    { subEndsAt: Timestamp.fromMillis(Date.now() + 9e9) }));
  await assertFails(updateDoc(doc(alice(), "users/alice"), { plan: "intensive" }));
});
test("🔴 ولا عند الإنشاء", async () => {
  await assertFails(setDoc(doc(bob(), "users/bob"), { name: "B", subscribed: true }));
  await assertSucceeds(setDoc(doc(bob(), "users/bob"), { name: "B" }));
});

/* ===== الطلبات ===== */
test("العميل يقرأ طلباته فقط", async () => {
  await assertSucceeds(getDocs(query(collection(alice(), "orders"), where("uid", "==", "alice"))));
  await assertFails(getDoc(doc(bob(), "orders/o1")));
  await assertFails(setDoc(doc(alice(), "orders/o2"), { uid: "alice", status: "paid" }));
});

/* ===== أي مسار ثاني ===== */
test("🔴 أي مسار غير مذكور مرفوض", async () => {
  await assertFails(setDoc(doc(alice(), "anything/x"), { a: 1 }));
  await assertFails(getDoc(doc(alice(), "config/nutrition")));
  await assertFails(setDoc(doc(alice(), "weights/alice"), { a: 1 }));
});
