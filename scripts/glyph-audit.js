import fs from 'fs';
import path from 'path';

const ALLOWED_REGEX = /^[\x20-\x7E\r\n\t]+$/;

function scanDir(dir, exts, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, exts, results);
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

export function auditGlyphs() {
  const files = [
    ...scanDir('public/ui', ['.uikitml']),
    ...scanDir('src', ['.ts', '.js'])
  ];

  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, lineIdx) => {
      // Find non-ASCII characters outside code comments
      for (let i = 0; i < line.length; i++) {
        const code = line.charCodeAt(i);
        if (code > 127) {
          const char = line[i];
          violations.push({
            file,
            line: lineIdx + 1,
            char,
            code: 'U+' + code.toString(16).toUpperCase().padStart(4, '0'),
            snippet: line.trim()
          });
        }
      }
    });
  }

  return violations;
}

if (process.argv[1] && process.argv[1].endsWith('glyph-audit.js')) {
  const violations = auditGlyphs();
  if (violations.length > 0) {
    console.log(`[Glyph Audit] Found ${violations.length} non-ASCII glyph occurrences:`);
    const uniqueChars = new Set(violations.map(v => `${v.char} (${v.code})`));
    console.log(`Unique non-ASCII characters:`, Array.from(uniqueChars).join(', '));
    console.log(`First 15 violations:`);
    violations.slice(0, 15).forEach(v => {
      console.log(`  ${v.file}:${v.line} -> ${v.char} (${v.code}) in "${v.snippet.slice(0, 60)}"`);
    });
  } else {
    console.log(`[Glyph Audit] Clean! 0 non-ASCII glyphs found. All characters in font atlas.`);
  }
}
