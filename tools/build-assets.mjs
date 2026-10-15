// Inlines the Kenney Pixel Platformer sheets (CC0) as data URIs, then bundles
// assets + engine into dist/pixelplatformer.js (single file for OutSystems).
// Usage: node game/tools/build-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sheets = join(gameDir, '..', 'assets_src', 'kenney', 'x', 'Tilemap');
const uri = f => 'data:image/png;base64,' + readFileSync(join(sheets, f)).toString('base64');

const assets = `/* Sprites: "Pixel Platformer" by Kenney (www.kenney.nl), CC0 1.0 */
window.PixelPlatformerAssets = ${JSON.stringify({
  tiles: uri('tilemap_packed.png'),
  chars: uri('tilemap-characters_packed.png'),
  bgs: uri('tilemap-backgrounds_packed.png'),
}, null, 1)};
`;
writeFileSync(join(gameDir, 'src', 'assets.js'), assets);

const levels = {};
for (const key of ['level1', 'level2']) levels[key] = JSON.parse(readFileSync(join(gameDir, 'levels', key + '.json'), 'utf8'));
const levelsJs = `window.PixelPlatformerLevels = ${JSON.stringify(levels)};\n`;

const engine = readFileSync(join(gameDir, 'src', 'engine.js'), 'utf8');
const bundle = assets + levelsJs + '\n' + engine;
mkdirSync(join(gameDir, 'dist'), { recursive: true });
writeFileSync(join(gameDir, 'dist', 'pixelplatformer.js'), bundle);
console.log('dist/pixelplatformer.js', bundle.length / 1024 | 0, 'KB');
