const fs = require('fs');
const path = require('path');
let encoder;
try {
  encoder = require('gpt-3-encoder');
} catch (e) {
  // If dependency is missing, we'll still provide a fallback estimate
  encoder = null;
}

const p = process.argv[2];
if (!p) {
  console.error('Usage: node scripts/estimate_tokens.js path/to/file.txt');
  process.exit(1);
}
const filePath = path.resolve(p);
try {
  const txt = fs.readFileSync(filePath, 'utf8');
  const chars = txt.length;
  const words = (txt.match(/\S+/g) || []).length;
  let tokens = null;
  if (encoder && encoder.encode) {
    try { tokens = encoder.encode(txt).length; } catch (e) { tokens = null; }
  }
  console.log(`File: ${filePath}`);
  console.log(`Characters: ${chars}`);
  console.log(`Words: ${words}`);
  if (tokens !== null) {
    console.log(`Estimated tokens (gpt-style): ${tokens}`);
    console.log(`Chars/token: ${(chars / tokens).toFixed(2)}`);
    console.log(`Tokens/word: ${(tokens / Math.max(1, words)).toFixed(3)}`);
  } else {
    // Fallback heuristic: assume 3.5 chars/token
    const approxTokens = Math.max(1, Math.round(chars / 3.5));
    console.log('gpt-3-encoder not installed; showing heuristic estimate');
    console.log(`Approx tokens (chars/3.5): ${approxTokens}`);
    console.log(`Approx chars/token: ${(chars / approxTokens).toFixed(2)}`);
  }
} catch (err) {
  console.error('Error reading file:', err.message);
  process.exit(2);
}
