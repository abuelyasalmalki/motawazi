/* ============================================================
   متوازي · تهيئة Firebase (compat)
   ============================================================
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
    apiKey: "AIzaSyD6S5hK-I4p1tUZyWGYsCzlhzu-73ak0U4",
    authDomain: "motawazi-prod.firebaseapp.com",
    projectId: "motawazi-prod",
    storageBucket: "motawazi-prod.firebasestorage.app",
    messagingSenderId: "848125765310",
    appId: "1:848125765310:web:15c8a4e7d3e045e68960ef"
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
