const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('sa_b_shakshouka')) {
    console.log('Found sa_b_shakshouka at index:', i);
    const obj = JSON.parse(lines[i]);
    console.log(Object.keys(obj));
    console.log('type:', obj.type);
    for (let k of Object.keys(obj)) {
      if (typeof obj[k] === 'string' && obj[k].includes('sa_b_shakshouka')) {
        console.log('Found in field:', k, 'length:', obj[k].length);
        const idx = obj[k].indexOf('{"version": 4');
        const idx2 = obj[k].indexOf('{\n  "version": 4');
        const idx3 = obj[k].indexOf('"version": 4');
        console.log('indices:', idx, idx2, idx3);
        const start = obj[k].lastIndexOf('{', idx3);
        const jsonStr = obj[k].slice(start).trim();
        const parsed = JSON.parse(jsonStr);
        console.log('PARSED:', parsed.version, parsed.name);
        fs.writeFileSync('./functions/meals.sa.json', JSON.stringify(parsed, null, 2), 'utf8');
        fs.writeFileSync('./meals.json', JSON.stringify(parsed, null, 2), 'utf8');
        console.log('WRITTEN BOTH FILES SUCCESSFULLY!');
        break;
      }
    }
    break;
  }
}
