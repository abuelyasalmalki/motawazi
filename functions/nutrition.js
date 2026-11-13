"use strict";

/* ============================================================
   متوازي · الاستمارة الصحية — وحدةٌ نقيّة بلا أي تبعيّة
   ============================================================
   التحقّق من الإجابات · حساب السعرات · الفرز الصحي.
   مفصولةٌ عن Firebase عمدًا لتُختبَر بـ`node functions/test.js`.

   🔴 لا رقم غذائيّ هنا: كل القيم من nutrition.config.json (يعدّله الأخصائي).
   ============================================================ */

const ACTIVITY = ["sedentary", "light", "moderate", "high"];
const PACES = ["slow", "moderate", "faster"];
const GOALS = ["lose", "maintain"];
const SEXES = ["male", "female"];

/* الحالات الصحية — أي «نعم» يعلّم الملف للأخصائي */
const HEALTH_KEYS = [
  "diabetes",        // السكري
  "hypertension",    // الضغط
  "heart",           // أمراض القلب
  "kidneyLiver",     // أمراض الكلى أو الكبد
  "pregnancy",       // الحمل أو الرضاعة (للنساء فقط)
  "surgery",         // عمليات سابقة (تكميم ونحوه)
  "eatingDisorder"   // اضطرابات الأكل حالياً أو سابقاً
];

/* ============================================================
   فحص ملف الإعداد — يُستدعى عند التحميل، فإعدادٌ خاطئ يُفشل
   الاختبارات والنشر بدل أن يحسب أرقامًا خاطئة بصمت.
   ============================================================ */
function validateConfig(cfg) {
  const errs = [];
  const posNum = (v) => typeof v === "number" && isFinite(v) && v > 0;
  const nonNeg = (v) => typeof v === "number" && isFinite(v) && v >= 0;

  if (!cfg || typeof cfg !== "object") return ["الإعداد مفقود"];
  if (typeof cfg.version !== "string" || !cfg.version) errs.push("version");
  ACTIVITY.forEach((k) => {
    const f = cfg.activityFactors && cfg.activityFactors[k];
    if (!(posNum(f) && f >= 1 && f <= 2.5)) errs.push("activityFactors." + k);
  });
  PACES.forEach((k) => {
    if (!nonNeg(cfg.paceDeficits && cfg.paceDeficits[k])) errs.push("paceDeficits." + k);
  });
  if (!nonNeg(cfg.maintainDeficit)) errs.push("maintainDeficit");
  SEXES.forEach((k) => {
    if (!posNum(cfg.minCalories && cfg.minCalories[k])) errs.push("minCalories." + k);
  });
  const m = cfg.macros || {};
  ["protein", "carbs", "fat"].forEach((k) => {
    if (!(nonNeg(m[k]) && m[k] <= 1)) errs.push("macros." + k);
    if (!posNum(cfg.kcalPerGram && cfg.kcalPerGram[k])) errs.push("kcalPerGram." + k);
  });
  if (Math.abs((m.protein || 0) + (m.carbs || 0) + (m.fat || 0) - 1) > 0.001) {
    errs.push("macros: المجموع لازم = 1");
  }
  if (!posNum(cfg.roundKcalTo)) errs.push("roundKcalTo");
  const b = cfg.bmi || {};
  if (!posNum(b.reviewBelow) || !posNum(b.reviewAtOrAbove) || !posNum(b.targetBelow)
      || b.reviewBelow >= b.reviewAtOrAbove) errs.push("bmi");
  if (!Number.isInteger(cfg.minAge) || cfg.minAge < 1) errs.push("minAge");
  const g = cfg.guardian || {};
  if (typeof g.enabled !== "boolean" || !Number.isInteger(g.minAge)) errs.push("guardian");
  const L = cfg.limits || {};
  ["age", "heightCm", "weightKg"].forEach((k) => {
    const r = L[k];
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] < r[1])) errs.push("limits." + k);
  });
  if (!Number.isInteger(L.textMax) || L.textMax < 1) errs.push("limits.textMax");
  return errs;
}

/* ============================================================
   التحقّق من الإجابات
   ============================================================
   قائمة سماح: ما لم يُذكر هنا يُهمَل. وكل خطأ يرجع برمزٍ ثابت
   (تترجمه الواجهة) لا بنصّ. */
function num(v) {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && isFinite(n) ? n : NaN;
}
function round1(n) { return Math.round(n * 10) / 10; }
function inRange(n, r) { return n >= r[0] && n <= r[1]; }
function cleanText(v, max) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  /* محارف التحكّم تُحذف، والمسافات تُقلَّم */
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return s.length > max ? null : s;
}

/* الأهليّة بالعمر — منفصلة لأن الواجهة تسألها قبل بقيّة الاستمارة */
function ageEligibility(age, cfg) {
  if (!Number.isInteger(age)) return "invalid";
  if (age >= cfg.minAge) return "adult";
  if (cfg.guardian.enabled && age >= cfg.guardian.minAge) return "minor";
  return "too_young";
}

function validateAnswers(raw, cfg, countryCodes) {
  const errors = [];
  const r = raw && typeof raw === "object" ? raw : {};
  const L = cfg.limits;
  const a = {};

  /* الدولة */
  a.country = typeof r.country === "string" ? r.country : "";
  if (countryCodes.indexOf(a.country) < 0) errors.push("country");

  /* الجنس والعمر */
  a.sex = SEXES.indexOf(r.sex) >= 0 ? r.sex : null;
  if (!a.sex) errors.push("sex");
  a.age = num(r.age);
  if (!Number.isInteger(a.age) || !inRange(a.age, L.age)) errors.push("age");
  const elig = ageEligibility(a.age, cfg);
  if (elig === "too_young") errors.push("age_not_eligible");

  /* الطول والوزن */
  a.heightCm = round1(num(r.heightCm));
  if (!inRange(a.heightCm, L.heightCm)) errors.push("heightCm");
  a.weightKg = round1(num(r.weightKg));
  if (!inRange(a.weightKg, L.weightKg)) errors.push("weightKg");

  /* الهدف والسرعة والوزن المستهدف */
  a.goal = GOALS.indexOf(r.goal) >= 0 ? r.goal : null;
  if (!a.goal) errors.push("goal");
  if (a.goal === "lose") {
    a.pace = PACES.indexOf(r.pace) >= 0 ? r.pace : null;
    if (!a.pace) errors.push("pace");
    a.targetKg = round1(num(r.targetKg));
    if (!inRange(a.targetKg, L.weightKg)) errors.push("targetKg");
    else if (!(a.targetKg < a.weightKg)) errors.push("targetKg_not_lower");
  } else {
    a.pace = null;
    a.targetKg = null;
  }

  /* النشاط */
  a.activity = ACTIVITY.indexOf(r.activity) >= 0 ? r.activity : null;
  if (!a.activity) errors.push("activity");

  /* الأسئلة الصحية: كل سؤال إجابته true أو false صريحة */
  const h = r.health && typeof r.health === "object" ? r.health : {};
  a.health = {};
  HEALTH_KEYS.forEach((k) => {
    if (k === "pregnancy" && a.sex === "male") { a.health[k] = false; return; }
    if (typeof h[k] !== "boolean") errors.push("health." + k);
    a.health[k] = h[k] === true;
  });

  /* نصوص اختيارية/مشروطة */
  function yesWithText(key) {
    const o = r[key] && typeof r[key] === "object" ? r[key] : {};
    if (typeof o.has !== "boolean") { errors.push(key); return { has: false, text: "" }; }
    const t = cleanText(o.text, L.textMax);
    if (t === null) { errors.push(key + ".text"); return { has: o.has, text: "" }; }
    if (o.has && !t) errors.push(key + ".text");
    return { has: o.has, text: o.has ? t : "" };
  }
  a.surgeryNote = a.health.surgery ? cleanText(r.surgeryNote, L.textMax) : "";
  if (a.surgeryNote === null) { errors.push("surgeryNote"); a.surgeryNote = ""; }
  a.medications = yesWithText("medications");
  a.allergies = yesWithText("allergies");

  /* التفضيلات */
  a.dislikes = cleanText(r.dislikes, L.textMax);
  if (a.dislikes === null) { errors.push("dislikes"); a.dislikes = ""; }
  if (typeof r.vegetarian !== "boolean") errors.push("vegetarian");
  a.vegetarian = r.vegetarian === true;

  /* الموافقات — إلزاميّتان */
  const c = r.consent && typeof r.consent === "object" ? r.consent : {};
  if (c.terms !== true) errors.push("consent.terms");
  if (c.health !== true) errors.push("consent.health");

  /* ولي الأمر — يُطلب فقط إن كانت شاشته مفعّلة والعميل قاصر */
  let guardian = null;
  if (elig === "minor") {
    const g = r.guardian && typeof r.guardian === "object" ? r.guardian : {};
    guardian = {
      name: cleanText(g.name, 80),
      relation: cleanText(g.relation, 40),
      phone: cleanText(g.phone, 25),
      consent: g.consent === true
    };
    if (!guardian.name) errors.push("guardian.name");
    if (!guardian.relation) errors.push("guardian.relation");
    if (!guardian.phone || !/^[0-9+\s-]{7,25}$/.test(guardian.phone)) errors.push("guardian.phone");
    if (!guardian.consent) errors.push("guardian.consent");
  }

  return { ok: errors.length === 0, errors: errors, answers: a, guardian: guardian, eligibility: elig };
}

/* ============================================================
   حساب السعرات — Mifflin-St Jeor × معامل النشاط − العجز
   ============================================================ */
function bmiOf(weightKg, heightCm) {
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

function bmrMifflin(sex, weightKg, heightCm, age) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

function computeCalc(a, cfg) {
  const bmr = bmrMifflin(a.sex, a.weightKg, a.heightCm, a.age);
  const tdee = bmr * cfg.activityFactors[a.activity];
  const deficit = a.goal === "lose" ? cfg.paceDeficits[a.pace] : cfg.maintainDeficit;
  const raw = tdee - deficit;
  const minKcal = cfg.minCalories[a.sex];

  /* 🔴 لا تنزل أبداً تحت الحد الأدنى الآمن */
  const floored = Math.max(raw, minKcal);
  const step = cfg.roundKcalTo;
  let kcal = Math.round(floored / step) * step;
  if (kcal < minKcal) kcal = Math.ceil(minKcal / step) * step;   // التقريب لا يكسر الحد

  const grams = {};
  ["protein", "carbs", "fat"].forEach((k) => {
    grams[k] = Math.round((kcal * cfg.macros[k]) / cfg.kcalPerGram[k]);
  });

  return {
    kcal: kcal,
    macros: grams,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficit: deficit,
    raisedToMin: raw < minKcal,
    minKcal: minKcal,
    bmi: bmiOf(a.weightKg, a.heightCm),
    targetBmi: a.targetKg ? bmiOf(a.targetKg, a.heightCm) : null,
    configVersion: cfg.version
  };
}

/* ============================================================
   الفرز الصحي — أي سبب ⇒ يحتاج مراجعة الأخصائي، ولا جدول تلقائي
   ============================================================ */
function triage(a, calc, cfg, eligibility) {
  const reasons = [];
  HEALTH_KEYS.forEach((k) => { if (a.health[k]) reasons.push(k); });
  if (a.medications.has) reasons.push("medications");
  if (eligibility === "minor") reasons.push("minor");
  if (calc.bmi < cfg.bmi.reviewBelow) reasons.push("bmi_low");
  if (calc.bmi >= cfg.bmi.reviewAtOrAbove) reasons.push("bmi_high");
  if (calc.targetBmi !== null && calc.targetBmi < cfg.bmi.targetBelow) reasons.push("target_bmi_low");
  return { flagged: reasons.length > 0, reasons: reasons };
}

module.exports = {
  ACTIVITY, PACES, GOALS, SEXES, HEALTH_KEYS,
  validateConfig, validateAnswers, ageEligibility,
  bmiOf, bmrMifflin, computeCalc, triage
};
