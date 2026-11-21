const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript_full.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('"version": 4')) {
    console.log('Found in transcript_full line index:', i);
    const obj = JSON.parse(lines[i]);
    console.log('Type:', obj.type, 'Source:', obj.source);
    if (obj.content) {
      console.log('Content length:', obj.content.length);
      const firstBrace = obj.content.indexOf('{\n  "version": 4');
      if (firstBrace !== -1) {
        const jsonStr = obj.content.slice(firstBrace).trim();
        const parsed = JSON.parse(jsonStr);
        console.log('Parsed version:', parsed.version);
        fs.writeFileSync('./functions/meals.sa.json', JSON.stringify(parsed, null, 2), 'utf8');
        fs.writeFileSync('./meals.json', JSON.stringify(parsed, null, 2), 'utf8');
        console.log('SAVED SUCCESSFULLY!');
        break;
      }
    }
  }
}
