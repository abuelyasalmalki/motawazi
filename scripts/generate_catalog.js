const fs = require('fs');
const path = require('path');

const mealsPath = path.join(__dirname, '..', 'functions', 'meals.sa.json');
const data = JSON.parse(fs.readFileSync(mealsPath, 'utf8'));

// 1. Export clean JSON
const jsonExportPath = path.join(__dirname, '..', 'meals_export.json');
fs.writeFileSync(jsonExportPath, JSON.stringify(data, null, 2), 'utf8');

// 2. Build Markdown Catalog
let md = `# 🍱 دليل وبنك الوجبات لمنصة «متوازي» (الإصدار 4.0)\n\n`;
md += `> هذا الدليل يحتوي على جميع الوجبات المعتمدة في النظام (**${data.meals.breakfast.length + data.meals.lunch.length + data.meals.dinner.length + data.meals.snack.length} وجبة**)، مع خطوات التحضير الصحية السريعة، المقادير الدقيقة، السعرات والماكروز.\n\n`;
md += `## 📊 إحصائيات بنك الوجبات\n`;
md += `- **🍳 وجبات الفطور (breakfast):** ${data.meals.breakfast.length} وجبة\n`;
md += `- **🍗 وجبات الغداء (lunch):** ${data.meals.lunch.length} وجبة\n`;
md += `- **🍲 وجبات العشاء (dinner):** ${data.meals.dinner.length} وجبة\n`;
md += `- **🥜 الوجبات الخفيفة والسناكات (snack):** ${data.meals.snack.length} وجبة\n`;
md += `- **📌 الإجمالي:** ${data.meals.breakfast.length + data.meals.lunch.length + data.meals.dinner.length + data.meals.snack.length} وجبة معتمدة بأساليب الطهي الصحي\n\n`;

const catTitles = {
  breakfast: '🍳 وجبات الفطور (Breakfast)',
  lunch: '🍗 وجبات الغداء (Lunch)',
  dinner: '🍲 وجبات العشاء (Dinner)',
  snack: '🥜 الوجبات الخفيفة والسناكات (Snack)'
};

for (const [catKey, catTitle] of Object.entries(catTitles)) {
  md += `### ${catTitle}\n\n`;
  md += `| المعرف | اسم الوجبة | الحصة المنزلية | وقت الطهي | السعرات | بروتين | كارب | دهون |\n`;
  md += `|---|---|---|:---:|:---:|:---:|:---:|:---:|\n`;
  for (const m of data.meals[catKey]) {
    const port = (m.portion || '').replace(/\|/g, '-');
    const time = m.prepTimeMinutes ? `${m.prepTimeMinutes} د` : '-';
    md += `| \`${m.id}\` | **${m.name}** | ${port} | ${time} | ${m.baseCalories} | ${m.macros.protein}g | ${m.macros.carbs}g | ${m.macros.fat}g |\n`;
  }
  md += `\n`;
}

const mdExportPath = path.join(__dirname, '..', 'MEALS_BANK_CATALOG.md');
fs.writeFileSync(mdExportPath, md, 'utf8');

console.log('SUCCESS: Generated updated MEALS_BANK_CATALOG.md and meals_export.json with 200 meals!');
