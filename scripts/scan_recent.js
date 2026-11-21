const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = 450; i < lines.length; i++) {
  const obj = JSON.parse(lines[i]);
  console.log(i, obj.type, obj.source, 'content len:', obj.content ? obj.content.length : 'none');
  if (obj.content && obj.content.includes('version')) {
    console.log('-> Content has version at', i);
  }
}
