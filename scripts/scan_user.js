const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');

for (let i = 0; i < lines.length; i++) {
  const obj = JSON.parse(lines[i]);
  if (obj.type === 'USER_INPUT') {
    console.log(i, 'truncated:', obj.truncated_fields, 'content len:', obj.content ? obj.content.length : 0);
  }
}
