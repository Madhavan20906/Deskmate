import fs from 'fs';
import path from 'path';

const REPLACEMENTS = [
  // Double arrows / symbols
  [/⟵/g, '<--'],
  [/⟶/g, '-->'],
  [/⬍/g, '<>'],
  [/⠿/g, '::'],
  [/↺/g, 'Reset'],
  [/◀/g, '<'],
  [/▶/g, '>'],
  [/⛶/g, 'Zoom'],
  [/≥/g, '>='],
  [/–/g, '-'],
  [/•/g, '-'],
  [/°/g, ''],
  [/✓/g, '[x]'],
  [/✅/g, '[x]'],
  [/✏/g, 'Edit'],
  [/⚙/g, 'Settings'],
  [/💡/g, 'Tip: '],
  [/💾/g, 'Save'],
  [/📊/g, 'Stats'],
  [/🌱/g, ''],
  [/🌳/g, ''],
  [/💧/g, 'Water'],
  [/🌿/g, 'Prune'],
  [/✨/g, 'Nurture'],
  [/☀/g, 'Sun'],
  [/🌙/g, 'Moon'],
  [/📚/g, 'Study'],
  [/📷/g, 'Capture'],
  [/💬/g, 'Ask'],
  [/🎙/g, 'Mic'],
  [/⚠/g, 'Alert: '],
  [/⏸/g, 'Pause'],
  [/±/g, '+/-'],
  [/🔥/g, 'Streak:'],
  [/📌/g, '*'],
  [/⏱/g, ''],
  [/💥/g, '*'],
  [/📅/g, ''],
  [/📙/g, ''],
  [/💻/g, ''],
  [/⛅/g, ''],
  [/👋/g, ''],
  [/🤖/g, 'Pip'],
  [/🚀/g, ''],
  [/📝/g, 'Notes'],
  [/🎯/g, 'Goals'],
  [/Â/g, ''],
];

const filesToClean = [
  'public/ui/glass-focus.uikitml',
  'public/ui/glass-hub.uikitml',
  'public/ui/glass-pip.uikitml',
  'public/ui/glass-tasks.uikitml',
  'src/desktop-preview.ts',
  'src/glass-data-adapters.ts',
  'src/panel.ts',
  'src/productivity-engine.ts',
  'src/schedule-ruler.ts'
];

for (const relPath of filesToClean) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');

  for (const [pattern, repl] of REPLACEMENTS) {
    content = content.replace(pattern, repl);
  }

  // Strip any lingering non-ASCII characters outside comments
  let cleaned = '';
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code <= 127) {
      cleaned += content[i];
    } else {
      // Non-ASCII character removed or replaced with space
      cleaned += ' ';
    }
  }

  // Clean up any double spaces introduced in text labels
  cleaned = cleaned.replace(/[ ]{2,}/g, ' ');

  fs.writeFileSync(fullPath, cleaned, 'utf8');
  console.log(`Cleaned ${relPath}`);
}
