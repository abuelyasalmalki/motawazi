const fs = require('fs');
const mediaPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.user_uploaded/media_1795267324495_f991a505.json';

const raw = fs.readFileSync(mediaPath, 'utf8');
const data = JSON.parse(raw);

console.log('Version:', data.version);
console.log('Name:', data.name);
console.log('Breakfast:', data.meals.breakfast.length);
console.log('Lunch:', data.meals.lunch.length);
console.log('Dinner:', data.meals.dinner.length);
console.log('Snack:', data.meals.snack.length);
console.log('Total:', data.meals.breakfast.length + data.meals.lunch.length + data.meals.dinner.length + data.meals.snack.length);

// Save to functions/meals.sa.json and meals.json
fs.writeFileSync('./functions/meals.sa.json', JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync('./meals.json', JSON.stringify(data, null, 2), 'utf8');

console.log('Successfully saved to functions/meals.sa.json and meals.json!');
