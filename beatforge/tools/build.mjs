// Concatenates src/*.js into dist/beatforge.js (one IIFE, no modules). Usage: node beatforge/tools/build.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const parts = readdirSync(src).filter(f => f.endsWith('.js')).sort()
  .map(f => readFileSync(join(src, f), 'utf8').replace(/\r\n/g, '\n'));
const banner = '/*! BeatForge engine v1.0.1 | music studio + visualizer + VR | requires Tone.js 14.8.49 and three.js r128 (globals) */\n';
let out = banner + '(function () {\n\'use strict\';\nif (typeof window === \'undefined\') return;\n' + parts.join('\n') + '\n})();\n';
// pure-ASCII output: immune to charset mix-ups on the host page
out = out.replace(/[^\x00-\x7F]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'beatforge.js'), out);
console.log('dist/beatforge.js', out.length, 'bytes');
