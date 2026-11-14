/* ============================================================
   متوازي · المصادقة (Auth) — Firebase compat
   ============================================================
   يُحمَّل بعد firebase-config.js.

   الواجهة:
     Auth.ready                 // جاهزية Firebase (true/false)
     Auth.user                  // مستخدم Firebase أو null
     Auth.onChange(cb)          // يُستدعى عند تغيّر الدخول أو حالة الاشتراك
                                // (وبالحالة الحالية فورًا إن كانت معروفة)
     Auth.signUpEmail(name,email,pw) / signInEmail(email,pw)
     Auth.signInGoogle() / signOut()
     Auth.resetPassword(email)
     Auth.displayName()
     Auth.isSubscribed / plan / subEndsAt / subDaysLeft()
       — تُقرأ من حقول subscribed / subEndsAt / plan في وثيقة users/{uid}.
       للعرض فقط: لا يكتبها المتصفح (قواعد Firestore تمنع ذلك)؛
       يكتبها ويب-هوك الدفع وحده.
     Auth.refresh()             // إعادة قراءة حالة الاشتراك (بعد العودة من الدفع)
   ============================================================ */
(function (global) {
  "use strict";

  var Auth = {
    ready: false,
    resolved: false,       // عُرفت حالة الدخول الأولى (وحالة الاشتراك إن وُجد مستخدم)
    user: null,
    isSubscribed: false,   // subscribed === true و subEndsAt لم ينتهِ
    plan: null,            // مفتاح الباقة (basic / followup / intensive) أو null
    subEndsAt: null,       // نهاية الاشتراك (ميلي ثانية) أو null
    subDaysLeft: function () {
      if (!this.subEndsAt) return 0;
      return Math.max(0, Math.ceil((this.subEndsAt - Date.now()) / 86400000));
    },
    _cbs: [],
    onChange: function (cb) {
      if (typeof cb !== "function") return;
      this._cbs.push(cb);
      // أبلِغ بالحالة الحالية فورًا — فقط بعد أن تُعرف، وإلا ظنّ المستدعي
      // أن المستخدم المسجَّل زائرٌ في اللحظة الأولى قبل استرجاع الجلسة.
      if (this.resolved) { try { cb(this.user); } catch (e) {} }
    },
    displayName: function () {
      var u = this.user;
      if (!u) return "زائر";
      return u.displayName || (u.email ? u.email.split("@")[0] : "عميل");
    },
    signUpEmail: function (name, email, pw) {
      return firebase.auth().createUserWithEmailAndPassword(email, pw).then(function (cred) {
        return cred.user.updateProfile({ displayName: name }).then(function () {
          Auth.user = cred.user;
          return touchProfile(cred.user).then(function () { return cred.user; });
        });
      });
    },
    signInEmail: function (email, pw) { return firebase.auth().signInWithEmailAndPassword(email, pw); },
    signInGoogle: function () {
      return firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
    },
    signOut: function () { return firebase.auth().signOut(); },
    resetPassword: function (email) { return firebase.auth().sendPasswordResetEmail(email); },
    refresh: function () { return Auth.user ? loadSub(Auth.user) : Promise.resolve(); }
  };

  function fire(u) { Auth.resolved = true; Auth._cbs.forEach(function (cb) { try { cb(u); } catch (e) {} }); }

  function clearSub() {
    Auth.isSubscribed = false;
    Auth.plan = null;
    Auth.subEndsAt = null;
  }

  /* الاسم والبريد فقط — حقول الاشتراك ممنوعة على المتصفح أصلًا */
  function touchProfile(u) {
    return firebase.firestore().collection("users").doc(u.uid).set({
      name: u.displayName || "",
      email: u.email || "",
      updated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function (e) {
      console.warn("[متوازي] حفظ الملف الشخصي فشل:", e && e.code);
    });
  }

  function loadSub(u) {
    return firebase.firestore().collection("users").doc(u.uid).get().then(function (snap) {
      var doc = (snap.exists && snap.data()) ? snap.data() : {};
      /* subEndsAt قد يكون Timestamp أو ميلي ثانية (تفعيلٌ يدويّ من الكونسول) */
      var ends = doc.subEndsAt;
      var endsMs = (ends && typeof ends.toMillis === "function") ? ends.toMillis()
                 : (typeof ends === "number" ? ends : 0);
      Auth.subEndsAt = endsMs || null;
      Auth.isSubscribed = doc.subscribed === true && endsMs > Date.now();
      Auth.plan = typeof doc.plan === "string" && doc.plan ? doc.plan : null;
    }).catch(function (e) {
      console.warn("[متوازي] قراءة حالة الاشتراك فشلت:", e && e.code);
      clearSub();
    }).then(function () { fire(Auth.user); });
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth || !global.FB_READY) {
      Auth.ready = false;
      fire(null);
      return;
    }
    Auth.ready = true;
    firebase.auth().onAuthStateChanged(function (u) {
      Auth.user = u || null;
      clearSub();
      if (u) {
        touchProfile(u);
        loadSub(u);   // يُطلق fire بعد قراءة الاشتراك
      } else {
        fire(null);
      }
    });
  }

  if (global.document && document.readyState === "loading") {
    global.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.Auth = Auth;
})(typeof window !== "undefined" ? window : this);
