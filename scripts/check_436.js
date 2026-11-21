const fs = require('fs');
const transcriptPath = 'C:/Users/ana/.gemini/antigravity/brain/71d58936-e304-4e96-9905-1dddb8fd6f99/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
console.log(lines[436]);
