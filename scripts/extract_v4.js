const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
const lineObj = JSON.parse(lines[436]);
const content = lineObj.content;

// Find first '{' where version is 4
const firstBrace = content.indexOf('{');
if (firstBrace === -1) {
  console.error('No brace found');
  process.exit(1);
}

const jsonStr = content.slice(firstBrace).trim();
const parsed = JSON.parse(jsonStr);

console.log('Version:', parsed.version);
console.log('Name:', parsed.name);
console.log('Breakfast:', parsed.meals.breakfast.length);
console.log('Lunch:', parsed.meals.lunch.length);
console.log('Dinner:', parsed.meals.dinner.length);
console.log('Snack:', parsed.meals.snack.length);
const total = parsed.meals.breakfast.length + parsed.meals.lunch.length + parsed.meals.dinner.length + parsed.meals.snack.length;
console.log('Total:', total);

fs.writeFileSync('./functions/meals.sa.json', JSON.stringify(parsed, null, 2), 'utf8');
fs.writeFileSync('./meals.json', JSON.stringify(parsed, null, 2), 'utf8');
console.log('Successfully written to functions/meals.sa.json and meals.json');
