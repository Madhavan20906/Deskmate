import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f141c"/>
    </radialGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8ce2d2"/>
      <stop offset="100%" stop-color="#0082fb"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="256" cy="210" r="90" fill="none" stroke="url(#accent)" stroke-width="24"/>
  <circle cx="256" cy="210" r="40" fill="#8ce2d2"/>
  <rect x="140" y="340" width="232" height="36" rx="18" fill="url(#accent)"/>
</svg>`;

await mkdir('public/icons', { recursive: true });
const png = (size, out) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);

await png(512, 'public/icons/icon-512.png');
await png(192, 'public/icons/icon-192.png');
await png(512, 'public/icons/icon-512-maskable.png');
console.log('Icons generated successfully.');
