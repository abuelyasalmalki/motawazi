/* ============================================================
   متوازي · الاستمارة الصحية على خطوات (المتصفح)
   ============================================================
   المتصفح يجمع الإجابات ويرسلها لدالّة submitIntake — هي وحدها تتحقّق
   وتحسب السعرات وتفرز وتحفظ. التحقّق هنا للراحة فقط.

   الحدود (العمر، الطول، الوزن…) تُقرأ من /config/nutrition.json — نفس
   ملف الإعداد الذي يقرؤه الخادم (ينسخه build_site.sh). لا أرقام هنا.

   الإجابات تُحفظ مؤقتاً في sessionStorage (تنمسح بإغلاق التبويب أو بعد
   الإرسال) عشان تحديث الصفحة ما يضيّع اللي انكتب.
   ============================================================ */
(function () {
  "use strict";

  var REGION = "me-central2";   // نفس REGION في functions/config.js
  var $ = function (id) { return document.getElementById(id); };

  var CFG = null;        // nutrition.json
  var COUNTRIES = [];    // countries.json
  var UID = null;
  var A = blank();       // الإجابات
  var idx = 0;           // الخطوة الحالية
  var sending = false;

  function blank() {
    return {
      country: "", sex: "", age: "", heightCm: "", weightKg: "",
      goal: "", pace: "", targetKg: "", activity: "",
      health: { diabetes: null, hypertension: null, heart: null, kidneyLiver: null,
                pregnancy: null, surgery: null, eatingDisorder: null },
      surgeryNote: "",
      medications: { has: null, text: "" },
      allergies: { has: null, text: "" },
      dislikes: "", vegetarian: null,
      consent: { terms: false, health: false },
      guardian: { name: "", relation: "", phone: "", consent: false }
    };
  }

  /* ===== أدوات ===== */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];   // نصوصٌ ثابتة من هذا الملف فقط
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* الأرقام العربية والفارسية ⇒ لاتينية، والفاصلة العشرية العربية ⇒ نقطة */
  function toNum(v) {
    var s = String(v == null ? "" : v).trim()
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[٫,]/g, ".");
    if (!s) return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function inRange(n, r) { return n >= r[0] && n <= r[1]; }

  function eligibility(age) {
    if (!Number.isInteger(age)) return "invalid";
    if (age >= CFG.minAge) return "adult";
    if (CFG.guardian.enabled && age >= CFG.guardian.minAge) return "minor";
    return "too_young";
  }

  function storeKey() { return "mtz_intake_" + UID; }
  function save() {
    try { sessionStorage.setItem(storeKey(), JSON.stringify({ a: A, i: idx })); } catch (e) {}
  }
  function restore() {
    try {
      var s = JSON.parse(sessionStorage.getItem(storeKey()) || "null");
      if (s && s.a) { A = merge(blank(), s.a); return s.i || 0; }
    } catch (e) {}
    return 0;
  }
  function merge(base, src) {
    Object.keys(base).forEach(function (k) {
      if (!(k in src)) return;
      if (base[k] && typeof base[k] === "object" && src[k] && typeof src[k] === "object") merge(base[k], src[k]);
      else base[k] = src[k];
    });
    return base;
  }

  /* ===== مكوّنات ===== */
  function choices(opts, value, onPick, two) {
    var box = el("div", { class: "choices" + (two ? " two" : "") });
    opts.forEach(function (o) {
      var b = el("button", {
        type: "button", class: "choice", "aria-pressed": String(value === o.value),
        onclick: function () {
          Array.prototype.forEach.call(box.children, function (c) { c.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          onPick(o.value);
        }
      }, [el("strong", { text: o.label }), o.hint ? el("small", { text: o.hint }) : null]);
      box.appendChild(b);
    });
    return box;
  }

  function yesNo(question, value, onPick, extra) {
    var wrap = el("div", { class: "yn" });
    wrap.appendChild(el("p", { text: question }));
    var extraBox = extra ? el("div", { class: "extra" + (value === true ? "" : " hidden") }, [extra]) : null;
    wrap.appendChild(choices([{ value: true, label: "نعم" }, { value: false, label: "لا" }], value, function (v) {
      onPick(v);
      if (extraBox) extraBox.classList.toggle("hidden", v !== true);
    }, true));
    if (extraBox) wrap.appendChild(extraBox);
    return wrap;
  }

  function field(label, input) {
    return el("div", {}, [el("label", { for: input.id, text: label }), input]);
  }
  function numInput(id, value, onInput, unit) {
    var i = el("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off",
      value: value === "" || value == null ? "" : String(value), dir: "ltr",
      placeholder: unit || "", oninput: function () { onInput(i.value); } });
    return i;
  }
  function textArea(id, value, onInput, ph) {
    var t = el("textarea", { id: id, maxlength: String(CFG.limits.textMax), placeholder: ph || "",
      oninput: function () { onInput(t.value); } });
    t.value = value || "";
    return t;
  }

  /* ============================================================
     الخطوات — كل خطوة: title، hint، render(box)، check() ⇒ خطأ أو null،
     وwhen() اختيارية لإخفائها.
     ============================================================ */
  var STEPS = [
    {
      id: "intro",
      title: "قبل ما نبدأ",
      render: function (box) {
        box.appendChild(el("p", { text: "بنسألك عن جسمك ونشاطك وصحتك وأكلك، عشان نحسب احتياجك اليومي التقريبي ويبني الأخصائي جدولك على أساسه." }));
        box.appendChild(el("p", { class: "muted small", text: "تاخذ الاستمارة تقريباً ٣ دقائق. إجاباتك الصحية سرية، ويطّلع عليها فريق متوازي المختص (أخصائي التغذية ومدرب اللياقة) فقط." }));
      },
      check: function () { return null; },
      next: "ابدأ"
    },
    {
      id: "country",
      title: "وش دولتك؟",
      hint: "نعرض لك أكلات بلدك الشعبية في جدولك.",
      render: function (box) {
        var s = el("select", { id: "f_country", onchange: function () { A.country = s.value; } });
        s.appendChild(el("option", { value: "", text: "اختر الدولة" }));
        COUNTRIES.forEach(function (c) { s.appendChild(el("option", { value: c.code, text: c.name })); });
        s.value = A.country;
        box.appendChild(s);
      },
      check: function () { return A.country ? null : "اختر دولتك."; }
    },
    {
      id: "sexAge",
      title: "الجنس والعمر",
      render: function (box) {
        box.appendChild(choices([{ value: "male", label: "ذكر" }, { value: "female", label: "أنثى" }],
          A.sex, function (v) { A.sex = v; }, true));
        box.appendChild(field("العمر بالسنوات", numInput("f_age", A.age, function (v) { A.age = v; }, "مثال: 30")));
      },
      check: function () {
        if (!A.sex) return "اختر الجنس.";
        var n = toNum(A.age);
        if (!Number.isInteger(n) || !inRange(n, [1, CFG.limits.age[1]])) return "اكتب عمرك بالسنوات.";
        return null;
      },
      after: function () {
        if (eligibility(toNum(A.age)) === "too_young") { showTooYoung(); return false; }
        return true;
      }
    },
    {
      /* شاشة ولي الأمر — مخفيّة ما دام guardian.enabled = false في الإعداد.
         لإرجاعها: فعّلها في functions/nutrition.config.json فقط. */
      id: "guardian",
      title: "موافقة ولي الأمر",
      hint: function () { return "لأن عمرك أقل من " + CFG.minAge + " سنة، نحتاج موافقة ولي أمرك، والأخصائي بيتواصل معه."; },
      when: function () { return eligibility(toNum(A.age)) === "minor"; },
      render: function (box) {
        var g = A.guardian;
        box.appendChild(field("اسم ولي الأمر", el("input", { id: "f_gname", type: "text", maxlength: "80", value: g.name,
          oninput: function (e) { g.name = e.target.value; } })));
        box.appendChild(field("صلته بك", el("input", { id: "f_grel", type: "text", maxlength: "40", value: g.relation,
          placeholder: "مثال: الأب", oninput: function (e) { g.relation = e.target.value; } })));
        box.appendChild(field("جوال ولي الأمر", el("input", { id: "f_gphone", type: "tel", maxlength: "25", dir: "ltr",
          value: g.phone, oninput: function (e) { g.phone = e.target.value; } })));
        var cb = el("input", { type: "checkbox", id: "f_gconsent", onchange: function () { g.consent = cb.checked; } });
        cb.checked = g.consent;
        box.appendChild(el("label", { class: "check", for: "f_gconsent" }, [cb,
          el("span", { text: "ولي أمري اطّلع على الخدمة ووافق على اشتراكي ومعالجة بياناتي الصحية." })]));
      },
      check: function () {
        var g = A.guardian;
        if (!g.name.trim() || !g.relation.trim()) return "اكتب اسم ولي الأمر وصلته بك.";
        if (!/^[0-9+\s-]{7,25}$/.test(g.phone.trim())) return "اكتب جوال ولي الأمر.";
        if (!g.consent) return "موافقة ولي الأمر مطلوبة.";
        return null;
      }
    },
    {
      id: "body",
      title: "الطول والوزن الحالي",
      render: function (box) {
        box.appendChild(field("الطول (سم)", numInput("f_h", A.heightCm, function (v) { A.heightCm = v; }, "مثال: 165")));
        box.appendChild(field("الوزن الحالي (كجم)", numInput("f_w", A.weightKg, function (v) { A.weightKg = v; }, "مثال: 80")));
      },
      check: function () {
        if (!inRange(toNum(A.heightCm), CFG.limits.heightCm)) return "اكتب طولك بالسنتيمتر (بين " + CFG.limits.heightCm[0] + " و" + CFG.limits.heightCm[1] + ").";
        if (!inRange(toNum(A.weightKg), CFG.limits.weightKg)) return "اكتب وزنك بالكيلو (بين " + CFG.limits.weightKg[0] + " و" + CFG.limits.weightKg[1] + ").";
        return null;
      }
    },
    {
      id: "goal",
      title: "وش هدفك؟",
      render: function (box) {
        var paceBox = el("div", { class: A.goal === "lose" ? "" : "hidden" });
        box.appendChild(choices([
          { value: "lose", label: "نزول الوزن" },
          { value: "maintain", label: "المحافظة على وزني", hint: "مع جدول أكل ورياضة منتظم" }
        ], A.goal, function (v) { A.goal = v; paceBox.classList.toggle("hidden", v !== "lose"); }));
        var d = CFG.paceDeficits;
        paceBox.appendChild(el("p", { class: "step-hint", style: "margin-top:18px", text: "السرعة اللي تناسبك:" }));
        paceBox.appendChild(choices([
          { value: "slow", label: "هادئ", hint: "نقص تقريبي " + d.slow + " سعرة في اليوم — أسهل في الالتزام" },
          { value: "moderate", label: "متوسط", hint: "نقص تقريبي " + d.moderate + " سعرة في اليوم" },
          { value: "faster", label: "أسرع", hint: "نقص تقريبي " + d.faster + " سعرة في اليوم — يحتاج التزام أعلى" }
        ], A.pace, function (v) { A.pace = v; }));
        paceBox.appendChild(el("p", { class: "muted small", text: "السعرات ما تنزل تحت حد أدنى آمن مهما كانت السرعة، والأخصائي يراجعها." }));
        box.appendChild(paceBox);
      },
      check: function () {
        if (!A.goal) return "اختر هدفك.";
        if (A.goal === "lose" && !A.pace) return "اختر السرعة اللي تناسبك.";
        return null;
      }
    },
    {
      id: "target",
      title: "وزنك المستهدف",
      hint: "تقدر تعدّله لاحقاً مع الأخصائي.",
      when: function () { return A.goal === "lose"; },
      render: function (box) {
        box.appendChild(field("الوزن المستهدف (كجم)", numInput("f_t", A.targetKg, function (v) { A.targetKg = v; }, "مثال: 70")));
      },
      check: function () {
        var t = toNum(A.targetKg);
        if (!inRange(t, CFG.limits.weightKg)) return "اكتب الوزن المستهدف بالكيلو.";
        if (!(t < toNum(A.weightKg))) return "الوزن المستهدف لازم يكون أقل من وزنك الحالي (" + toNum(A.weightKg) + " كجم).";
        return null;
      }
    },
    {
      id: "activity",
      title: "مستوى نشاطك اليومي",
      render: function (box) {
        box.appendChild(choices([
          { value: "sedentary", label: "خامل", hint: "أغلب يومك جالس، وما تمارس رياضة" },
          { value: "light", label: "خفيف", hint: "مشي أو رياضة خفيفة ١–٣ أيام في الأسبوع" },
          { value: "moderate", label: "متوسط", hint: "رياضة متوسطة ٣–٥ أيام في الأسبوع" },
          { value: "high", label: "عالي", hint: "رياضة قوية ٦–٧ أيام في الأسبوع، أو عمل بدني" }
        ], A.activity, function (v) { A.activity = v; }));
      },
      check: function () { return A.activity ? null : "اختر مستوى نشاطك."; }
    },
    {
      id: "health1",
      title: "أسئلة صحية",
      hint: "إجاباتك تساعد الأخصائي يبني لك جدول مناسب.",
      render: function (box) {
        var h = A.health;
        [["diabetes", "عندك سكري؟"], ["hypertension", "عندك ضغط؟"],
         ["heart", "عندك أي مرض في القلب؟"], ["kidneyLiver", "عندك أي مرض في الكلى أو الكبد؟"]]
          .forEach(function (q) { box.appendChild(yesNo(q[1], h[q[0]], function (v) { h[q[0]] = v; })); });
      },
      check: function () {
        var h = A.health;
        return [h.diabetes, h.hypertension, h.heart, h.kidneyLiver].some(function (v) { return v === null; })
          ? "جاوب على كل الأسئلة." : null;
      }
    },
    {
      id: "health2",
      title: "أسئلة صحية",
      render: function (box) {
        var h = A.health;
        if (A.sex === "female") {
          box.appendChild(yesNo("أنتِ حامل أو مرضعة حالياً؟", h.pregnancy, function (v) { h.pregnancy = v; }));
        }
        box.appendChild(yesNo("سويت قبل عملية في المعدة أو للسمنة؟ (مثل التكميم أو التحويل أو البالون)", h.surgery,
          function (v) { h.surgery = v; },
          field("وش العملية ومتى تقريباً؟ (اختياري)", textArea("f_surg", A.surgeryNote, function (v) { A.surgeryNote = v; }))));
      },
      check: function () {
        var h = A.health;
        if (A.sex === "female" && h.pregnancy === null) return "جاوبي على سؤال الحمل والرضاعة.";
        if (h.surgery === null) return "جاوب على سؤال العمليات.";
        return null;
      }
    },
    {
      id: "eating",
      title: "علاقتك بالأكل",
      hint: "سؤال مهم، وإجابتك سرية ويطّلع عليها الأخصائي فقط.",
      render: function (box) {
        box.appendChild(yesNo(
          "عانيت حالياً أو سابقاً من اضطراب في الأكل؟ مثل نوبات أكل كثير بدون تحكّم (الشره)، أو تقييد شديد للأكل (فقدان الشهية العصبي)، أو الاستفراغ بعد الأكل.",
          A.health.eatingDisorder, function (v) { A.health.eatingDisorder = v; }));
      },
      check: function () { return A.health.eatingDisorder === null ? "جاوب على السؤال." : null; }
    },
    {
      id: "meds",
      title: "الأدوية والحساسية",
      render: function (box) {
        var m = A.medications, al = A.allergies;
        box.appendChild(yesNo("تستخدم أي أدوية حالياً؟", m.has, function (v) { m.has = v; },
          field("وش الأدوية؟", textArea("f_meds", m.text, function (v) { m.text = v; }, "اسم الدواء، وإذا تعرف الجرعة"))));
        box.appendChild(yesNo("عندك حساسية من أكلات معيّنة؟", al.has, function (v) { al.has = v; },
          field("وش الأكلات؟", textArea("f_all", al.text, function (v) { al.text = v; }, "مثال: الفول السوداني، الروبيان"))));
      },
      check: function () {
        var m = A.medications, al = A.allergies;
        if (m.has === null || al.has === null) return "جاوب على السؤالين.";
        if (m.has && !m.text.trim()) return "اكتب أسماء الأدوية.";
        if (al.has && !al.text.trim()) return "اكتب الأكلات اللي عندك منها حساسية.";
        return null;
      }
    },
    {
      id: "prefs",
      title: "تفضيلاتك في الأكل",
      render: function (box) {
        box.appendChild(field("أكلات ما تحبها (اختياري)",
          textArea("f_dis", A.dislikes, function (v) { A.dislikes = v; }, "مثال: الباذنجان، السمك")));
        box.appendChild(yesNo("أنت نباتي؟", A.vegetarian, function (v) { A.vegetarian = v; }));
      },
      check: function () { return A.vegetarian === null ? "جاوب على سؤال النباتي." : null; }
    },
    {
      id: "consent",
      title: "الموافقات",
      render: function (box) {
        var c = A.consent;
        function cbox(id, key, kids) {
          var i = el("input", { type: "checkbox", id: id, onchange: function () { c[key] = i.checked; } });
          i.checked = c[key];
          return el("label", { class: "check", for: id }, [i, el("span", {}, kids)]);
        }
        box.appendChild(cbox("f_terms", "terms", ["قرأت ", el("a", { href: "/terms", target: "_blank", text: "الشروط والأحكام" }), " وأوافق عليها."]));
        box.appendChild(cbox("f_health", "health", ["أوافق على معالجة بياناتي الصحية لغرض إعداد جدولي ومتابعتي، كما هو موضح في ",
          el("a", { href: "/privacy", target: "_blank", text: "سياسة الخصوصية" }), "."]));
      },
      check: function () {
        if (!A.consent.terms) return "الموافقة على الشروط مطلوبة.";
        if (!A.consent.health) return "الموافقة على معالجة البيانات الصحية مطلوبة.";
        return null;
      }
    },
    {
      id: "review",
      title: "راجع إجاباتك",
      hint: "اضغط «تعديل» عند أي إجابة تبي تغيّرها.",
      render: function (box) { box.appendChild(reviewList()); },
      check: function () { return null; },
      next: "إرسال"
    }
  ];

  function stepIndex(id) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i;
    return 0;
  }
  function visible(i) { var s = STEPS[i]; return !s.when || s.when(); }

  /* ===== المراجعة ===== */
  var LBL = {
    sex: { male: "ذكر", female: "أنثى" },
    goal: { lose: "نزول الوزن", maintain: "المحافظة على الوزن" },
    pace: { slow: "هادئ", moderate: "متوسط", faster: "أسرع" },
    activity: { sedentary: "خامل", light: "خفيف", moderate: "متوسط", high: "عالي" }
  };
  function yn(v) { return v === true ? "نعم" : v === false ? "لا" : "—"; }
  function countryName(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i].name;
    return code;
  }
  function reviewList() {
    var h = A.health;
    var rows = [
      ["country", "الدولة", countryName(A.country)],
      ["sexAge", "الجنس والعمر", LBL.sex[A.sex] + "، " + toNum(A.age) + " سنة"],
      ["body", "الطول والوزن", toNum(A.heightCm) + " سم، " + toNum(A.weightKg) + " كجم"],
      ["goal", "الهدف", LBL.goal[A.goal] + (A.goal === "lose" ? " — " + LBL.pace[A.pace] : "")]
    ];
    if (A.goal === "lose") rows.push(["target", "الوزن المستهدف", toNum(A.targetKg) + " كجم"]);
    rows.push(["activity", "النشاط", LBL.activity[A.activity]]);
    rows.push(["health1", "السكري / الضغط / القلب / الكلى والكبد",
      [h.diabetes, h.hypertension, h.heart, h.kidneyLiver].map(yn).join(" / ")]);
    if (A.sex === "female") rows.push(["health2", "حمل أو رضاعة", yn(h.pregnancy)]);
    rows.push(["health2", "عملية سابقة", yn(h.surgery) + (h.surgery && A.surgeryNote ? " — " + A.surgeryNote : "")]);
    rows.push(["eating", "اضطرابات الأكل", yn(h.eatingDisorder)]);
    rows.push(["meds", "الأدوية", A.medications.has ? A.medications.text : "لا"]);
    rows.push(["meds", "الحساسية", A.allergies.has ? A.allergies.text : "لا"]);
    rows.push(["prefs", "أكلات ما تحبها", A.dislikes || "—"]);
    rows.push(["prefs", "نباتي", yn(A.vegetarian)]);

    var dl = el("dl", { class: "review" });
    rows.forEach(function (r) {
      dl.appendChild(el("dt", {}, [r[1] + " · ", el("button", { type: "button", class: "link-btn edit", text: "تعديل",
        onclick: function () { go(stepIndex(r[0]), true); } })]));
      dl.appendChild(el("dd", { text: r[2] }));
    });
    return dl;
  }

  /* ===== التنقّل ===== */
  function render() {
    var s = STEPS[idx];
    var total = STEPS.filter(function (_, i) { return visible(i); }).length;
    var pos = STEPS.slice(0, idx + 1).filter(function (_, i) { return visible(i); }).length;
    $("bar").style.width = Math.round((pos / total) * 100) + "%";

    var box = $("step");
    box.innerHTML = "";
    box.appendChild(el("h1", { class: "step-title", text: s.title }));
    var hint = typeof s.hint === "function" ? s.hint() : s.hint;
    if (hint) box.appendChild(el("p", { class: "step-hint", text: hint }));
    var body = el("div");
    s.render(body);
    box.appendChild(body);
    $("err").textContent = "";
    $("back").classList.toggle("hidden", idx === 0);
    $("next").textContent = s.next || "التالي";
    $("next").disabled = false;
    window.scrollTo(0, 0);
    var first = box.querySelector("input,select,textarea");
    if (first && idx > 0 && window.matchMedia("(min-width: 720px)").matches) first.focus();
  }

  function go(i, push) {
    idx = i;
    save();
    if (push) history.pushState({ step: i }, "");
    render();
  }

  function nextVisible(from, dir) {
    var i = from + dir;
    while (i >= 0 && i < STEPS.length && !visible(i)) i += dir;
    return i;
  }

  function onNext() {
    var s = STEPS[idx];
    var e = s.check();
    if (e) { $("err").textContent = e; return; }
    if (s.after && !s.after()) return;
    if (s.id === "review") { submit(); return; }
    go(nextVisible(idx, 1), true);
  }

  function onBack() {
    if (idx > 0) history.back();
  }

  window.addEventListener("popstate", function (ev) {
    if ($("tooYoung") && !$("tooYoung").classList.contains("hidden")) {
      $("tooYoung").classList.add("hidden");
      $("form").classList.remove("hidden");
    }
    var i = ev.state && typeof ev.state.step === "number" ? ev.state.step : 0;
    if (i >= 0 && i < STEPS.length) { idx = visible(i) ? i : nextVisible(i, -1); save(); render(); }
  });

  /* ===== أقل من السن المسموح ===== */
  function showTooYoung() {
    $("form").classList.add("hidden");
    $("tooYoung").classList.remove("hidden");
    history.pushState({ step: idx, tooYoung: true }, "");
    window.scrollTo(0, 0);
  }

  /* ===== الإرسال ===== */
  var ERR_STEP = {
    country: "country", sex: "sexAge", age: "sexAge", heightCm: "body", weightKg: "body",
    goal: "goal", pace: "goal", targetKg: "target", targetKg_not_lower: "target", activity: "activity",
    "health.diabetes": "health1", "health.hypertension": "health1", "health.heart": "health1",
    "health.kidneyLiver": "health1", "health.pregnancy": "health2", "health.surgery": "health2",
    surgeryNote: "health2", "health.eatingDisorder": "eating",
    medications: "meds", "medications.text": "meds", allergies: "meds", "allergies.text": "meds",
    dislikes: "prefs", vegetarian: "prefs", "consent.terms": "consent", "consent.health": "consent"
  };

  function payload() {
    var h = A.health;
    var out = {
      country: A.country, sex: A.sex, age: toNum(A.age),
      heightCm: toNum(A.heightCm), weightKg: toNum(A.weightKg),
      goal: A.goal, pace: A.goal === "lose" ? A.pace : null,
      targetKg: A.goal === "lose" ? toNum(A.targetKg) : null,
      activity: A.activity,
      health: {
        diabetes: h.diabetes, hypertension: h.hypertension, heart: h.heart, kidneyLiver: h.kidneyLiver,
        pregnancy: A.sex === "female" ? h.pregnancy : false,
        surgery: h.surgery, eatingDisorder: h.eatingDisorder
      },
      surgeryNote: h.surgery ? A.surgeryNote.trim() : "",
      medications: { has: A.medications.has, text: A.medications.has ? A.medications.text.trim() : "" },
      allergies: { has: A.allergies.has, text: A.allergies.has ? A.allergies.text.trim() : "" },
      dislikes: A.dislikes.trim(),
      vegetarian: A.vegetarian,
      consent: { terms: A.consent.terms, health: A.consent.health }
    };
    if (eligibility(out.age) === "minor") {
      out.guardian = { name: A.guardian.name.trim(), relation: A.guardian.relation.trim(),
                       phone: A.guardian.phone.trim(), consent: A.guardian.consent };
    }
    return out;
  }

  /* ===== حساب السعرات والفرز في المتصفح ===== */
  function bmiOf(weightKg, heightCm) {
    var m = heightCm / 100;
    return Math.round((weightKg / (m * m)) * 10) / 10;
  }

  function bmrMifflin(sex, weightKg, heightCm, age) {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
  }

  function computeClientCalc(a, cfg) {
    var bmr = bmrMifflin(a.sex, a.weightKg, a.heightCm, a.age);
    var tdee = bmr * (cfg.activityFactors ? cfg.activityFactors[a.activity] : 1.375);
    var deficit = a.goal === "lose" ? (cfg.paceDeficits ? cfg.paceDeficits[a.pace] : 500) : (cfg.maintainDeficit || 0);
    var raw = tdee - deficit;
    var minKcal = (cfg.minCalories && cfg.minCalories[a.sex]) || (a.sex === "male" ? 1500 : 1200);
    var floored = Math.max(raw, minKcal);
    var step = cfg.roundKcalTo || 50;
    var kcal = Math.round(floored / step) * step;
    if (kcal < minKcal) kcal = Math.ceil(minKcal / step) * step;

    var grams = {};
    var macros = (cfg.macros) || { protein: 0.25, carbs: 0.45, fat: 0.30 };
    var kcalPerGram = (cfg.kcalPerGram) || { protein: 4, carbs: 4, fat: 9 };
    ["protein", "carbs", "fat"].forEach(function(k) {
      grams[k] = Math.round((kcal * macros[k]) / kcalPerGram[k]);
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
      configVersion: cfg.version || "1.0"
    };
  }

  function computeClientTriage(a, calc, cfg, elig) {
    var reasons = [];
    var healthKeys = ["diabetes", "hypertension", "heart", "kidneyLiver", "pregnancy", "surgery", "eatingDisorder"];
    healthKeys.forEach(function(k) {
      if (a.health && a.health[k]) reasons.push(k);
    });
    if (a.medications && a.medications.has) reasons.push("medications");
    if (elig === "minor") reasons.push("minor");
    var bmiCfg = cfg.bmi || { reviewBelow: 18.5, reviewAtOrAbove: 35, targetBelow: 18.5 };
    if (calc.bmi < bmiCfg.reviewBelow) reasons.push("bmi_low");
    if (calc.bmi >= bmiCfg.reviewAtOrAbove) reasons.push("bmi_high");
    if (calc.targetBmi !== null && calc.targetBmi < bmiCfg.targetBelow) reasons.push("target_bmi_low");
    return { flagged: reasons.length > 0, reasons: reasons };
  }

  function submit() {
    if (sending) return;
    sending = true;
    $("next").disabled = true;
    $("next").textContent = "جاري الإرسال…";
    $("err").textContent = "";

    var user = firebase.auth().currentUser;
    if (!user) {
      sending = false;
      $("next").disabled = false;
      $("next").textContent = "إرسال";
      $("err").textContent = "انتهت الجلسة، سجّل دخولك أولاً للمتابعة.";
      return;
    }

    var answersPayload = payload();

    // محاولة الإرسال لدالة السحابة submitIntake أولاً إذا كانت منشورة
    firebase.app().functions(REGION).httpsCallable("submitIntake")({ answers: answersPayload })
      .then(function () {
        try { sessionStorage.removeItem(storeKey()); } catch (e) {}
        location.replace("/summary");
      })
      .catch(function (e) {
        var d = (e && e.details) || {};
        if (d.code === "age_not_eligible") {
          sending = false;
          $("next").disabled = false;
          $("next").textContent = "إرسال";
          showTooYoung();
          return;
        }
        if (d.code === "locked") {
          sending = false;
          $("next").disabled = false;
          $("next").textContent = "إرسال";
          $("err").innerHTML = "";
          $("err").appendChild(el("span", {}, ["طلبك قيد المراجعة، وما تقدر تعدّله الحين. ",
            el("a", { href: "/summary", text: "شوف حالة طلبك" })]));
          return;
        }

        // إذا كانت دالة السحابة غير منشورة في فايربيس، يتم الحفظ المباشر فوراً
        console.warn("[متوازي] دالة السحابة غير متاحة، جاري الحفظ المباشر في قاعدة البيانات:", e);
        directFirestoreSave(user, answersPayload);
      });
  }

  function directFirestoreSave(user, p) {
    try {
      var calc = computeClientCalc(p, CFG || {});
      var tri = computeClientTriage(p, calc, CFG || {}, eligibility(p.age));
      var now = firebase.firestore.FieldValue.serverTimestamp();
      var db = firebase.firestore();

      var profileDoc = {
        uid: user.uid,
        answers: p,
        calc: calc,
        triage: tri,
        status: "received",
        consent: {
          terms: true,
          health: true,
          version: "draft-2026-11",
          at: now
        },
        createdAt: now,
        updatedAt: now
      };

      db.collection("profiles").doc(user.uid).set(profileDoc)
        .then(function() {
          return db.collection("weights").doc(user.uid).collection("entries").doc("intake").set({
            weightKg: p.weightKg,
            source: "intake",
            date: now
          });
        })
        .then(function() {
          try { sessionStorage.removeItem(storeKey()); } catch (e) {}
          location.replace("/summary");
        })
        .catch(function(err) {
          console.error("[متوازي] خطأ عند حفظ الاستمارة في فايرستور:", err);
          sending = false;
          $("next").disabled = false;
          $("next").textContent = "إرسال";
          if (err && err.code === "permission-denied") {
            $("err").textContent = "تعذّر الحفظ: يرجى التأكد من نشر وتفعيل قواعد Firestore في فايربيس.";
          } else {
            $("err").textContent = "تعذّر الإرسال، تأكد من اتصال الإنترنت وحاول مرة ثانية.";
          }
        });
    } catch (ex) {
      console.error("[متوازي] استثناء أثناء إعداد البيانات:", ex);
      sending = false;
      $("next").disabled = false;
      $("next").textContent = "إرسال";
      $("err").textContent = "حدث خطأ غير متوقع، حاول مرة ثانية.";
    }
  }

  /* ===== التشغيل ===== */
  function fail(msg) {
    $("boot").className = "msg err";
    $("boot").textContent = msg;
  }

  function loadConfig() {
    return Promise.all([
      fetch("/config/nutrition.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw r; return r.json(); }),
      fetch("/config/countries.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw r; return r.json(); })
    ]).then(function (res) { CFG = res[0]; COUNTRIES = res[1]; });
  }

  function startForm(prefill) {
    if (prefill) {
      try { sessionStorage.removeItem(storeKey()); } catch (e) {}
      A = merge(blank(), prefill);
      A.consent = { terms: false, health: false };
      idx = 0;
    } else {
      var i = restore();
      if (!visible(i)) i = 0;
      idx = i;
    }
    history.replaceState({ step: idx }, "");
    $("boot").classList.add("hidden");
    $("form").classList.remove("hidden");
    render();
  }

  function start() {
    if (!window.Auth || !Auth.ready) { fail("الخدمة غير متاحة حالياً."); return; }
    var begun = false;
    Auth.onChange(function (u) {
      if (!u) { location.replace("/login?next=" + encodeURIComponent("/start" + location.search)); return; }
      if (begun) return;
      begun = true;
      UID = u.uid;
      Promise.all([
        loadConfig(),
        firebase.firestore().collection("profiles").doc(u.uid).get()
      ]).then(function (res) {
        var snap = res[1];
        if (snap.exists) {
          var p = snap.data();
          /* المستخدم عنده ملف سابق ➔ نفتح له الاستمارة للتعديل مع إظهار شريط التنبيه */
          var notice = $("editNotice");
          if (notice) {
            notice.classList.remove("hidden");
            notice.style.display = "block";
          }
          startForm(p.answers || null);
        } else {
          startForm(null);
        }
      }).catch(function (err) {
        console.error("[متوازي] فشل تحميل الملف الشخصي:", err);
        fail("تعذّر التحميل، حدّث الصفحة.");
      });
    });
  }

  $("next").addEventListener("click", onNext);
  $("back").addEventListener("click", onBack);
  window.addEventListener("load", start);
})();
