const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('"version": 4') || lines[i].includes('بنك الوجبات المتوازي المتكامل')) {
    console.log('Found in line index:', i);
    const obj = JSON.parse(lines[i]);
    console.log('Keys:', Object.keys(obj));
    console.log('Truncated:', obj.truncated_fields);
    console.log('Content snippet:', (obj.content || '').slice(0, 100));
    break;
  }
}
