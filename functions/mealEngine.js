"use strict";

/* ============================================================
   متوازي · محرك الوجبات وتوليد الجداول اليومية الذكية
   ============================================================
   - يأخذ سعرات العميل التقديرية (مثلاً 1800 سعرة)
   - يوزعها على الفترات (فطور 25%، غداء 40%، عشاء 25%، سناك 10%)
   - يختار وجبات متناسقة من بنك الأكلات السعودية بحصص ومقاييس واضحة
   - يتيح ميزة زر «بدّل» للوجبات المكافئة بنفس السعرات
   ============================================================ */

const mealsDB = require("./meals.sa.json").meals;

// النسب المعتمدة لتوزيع السعرات على مدار اليوم
const MEAL_SLOT_RATIOS = {
  breakfast: 0.25, // 25%
  lunch: 0.40,     // 40%
  dinner: 0.25,    // 25%
  snack: 0.10      // 10%
};

/**
 * دالة مساعدة لتعديل الحصة تلقائياً وفق سعرات العميل
 * معامل التعديل = السعرات المستهدفة للفتحة / السعرات الأساسية للوجبة
 */
function scaleMeal(meal, targetSlotCalories) {
  const factor = targetSlotCalories / meal.baseCalories;
  // تقريب المعامل لنسب واقعية (بين 0.7x و 1.4x)
  const clampedFactor = Math.min(Math.max(factor, 0.75), 1.35);

  const scaledKcal = Math.round(meal.baseCalories * clampedFactor);
  const scaledProtein = Math.round(meal.macros.protein * clampedFactor);
  const scaledCarbs = Math.round(meal.macros.carbs * clampedFactor);
  const scaledFat = Math.round(meal.macros.fat * clampedFactor);

  return {
    id: meal.id,
    name: meal.name,
    category: meal.category,
    description: meal.description,
    portion: meal.portion,
    portionUnit: meal.portionUnit,
    scaleWeightText: meal.scaleWeightText,
    scaleWeights: meal.scaleWeights,
    calories: scaledKcal,
    macros: {
      protein: scaledProtein,
      carbs: scaledCarbs,
      fat: scaledFat
    },
    scaleFactor: Number(clampedFactor.toFixed(2)),
    tags: meal.tags
  };
}

/**
 * توليد خطة يوم كامل بناءً على سعرات العميل التقديرية
 * @param {number} targetDailyCalories إجمالي السعرات (مثلاً 1800)
 * @param {number} dayIndex مؤشر اليوم (0-6) لتنويع الوجبات أسبوعياً
 */
function generateDailyPlan(targetDailyCalories, dayIndex = 0) {
  const dailyCalories = Math.max(targetDailyCalories || 1500, 1200);

  const slots = ["breakfast", "lunch", "dinner", "snack"];
  const plan = {
    targetCalories: dailyCalories,
    actualCalories: 0,
    totalMacros: { protein: 0, carbs: 0, fat: 0 },
    meals: {}
  };

  slots.forEach(slotKey => {
    const slotTargetKcal = Math.round(dailyCalories * MEAL_SLOT_RATIOS[slotKey]);
    const availableMeals = mealsDB[slotKey];
    
    // اختيار وجبة اليوم حسب اليوم بالتناوب
    const selectedMeal = availableMeals[dayIndex % availableMeals.length];
    const scaled = scaleMeal(selectedMeal, slotTargetKcal);

    plan.meals[slotKey] = scaled;
    plan.actualCalories += scaled.calories;
    plan.totalMacros.protein += scaled.macros.protein;
    plan.totalMacros.carbs += scaled.macros.carbs;
    plan.totalMacros.fat += scaled.macros.fat;
  });

  return plan;
}

/**
 * دالة زر «بدّل» الفوري:
 * ترجع وجبة بديلة مكافئة من نفس الفئة بنفس السعرات
 * @param {string} currentMealId معرّف الوجبة الحالية
 * @param {string} category فئة الوجبة (breakfast | lunch | dinner | snack)
 * @param {number} targetCalories السعرات المستهدفة لهذه الوجبة
 */
function swapMeal(currentMealId, category, targetCalories) {
  const list = mealsDB[category];
  if (!list || !list.length) return null;

  // استبعاد الوجبة الحالية
  const alternatives = list.filter(m => m.id !== currentMealId);
  const pool = alternatives.length ? alternatives : list;

  // اختيار وجبة عشوائية من البدائل
  const randomIndex = Math.floor(Math.random() * pool.length);
  const nextMeal = pool[randomIndex];

  return scaleMeal(nextMeal, targetCalories);
}

/**
 * جلب جميع البدائل المتاحة لوجبة معينة
 */
function getAlternatives(category, targetCalories) {
  const list = mealsDB[category] || [];
  return list.map(m => scaleMeal(m, targetCalories));
}

module.exports = {
  generateDailyPlan,
  swapMeal,
  getAlternatives,
  MEAL_SLOT_RATIOS
};
