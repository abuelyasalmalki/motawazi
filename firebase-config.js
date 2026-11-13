/* ============================================================
   متوازي · تهيئة Firebase (compat)
   ============================================================
   🔴 القيم فارغة عمدًا حتى يُنشأ مشروع Firebase الخاص بمتوازي.
   من أين تأتي: Firebase Console ← ⚙️ Project settings ← General ←
   Your apps ← (تطبيق ويب) ← SDK setup and configuration ← Config.

   مفتاح الويب عامٌّ وآمن في كود المتصفح — الحماية عبر قواعد
   Firestore و Auth (انظر firestore.rules).
   يُحمَّل بعد سكربتات firebase-*-compat.js وقبل auth.js.
   ============================================================ */
(function () {
  "use strict";
  if (typeof firebase === "undefined" || !firebase.initializeApp) {
    console.warn("[متوازي] Firebase SDK غير محمّل.");
    return;
  }
  var firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn("[متوازي] إعداد Firebase فارغ — املأ firebase-config.js.");
    return;
  }
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    window.FB_READY = true;
  } catch (e) {
    console.warn("[متوازي] تعذّر تهيئة Firebase:", e);
  }
})();
