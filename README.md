# PixelPlatformer

A small Mario-style platformer engine on `<canvas>`, used by the PixelPlatformer OutSystems (ODC) app.

- `dist/pixelplatformer.js` — single-file bundle (engine + sprites + built-in levels). This is what the app loads.
- `src/engine.js` — engine source. `levels/` — level maps. `tools/` — build scripts.

Build: `node tools/build-levels.mjs && node tools/build-assets.mjs`. Test locally: `node tools/serve.mjs` then open http://localhost:8137/.

## API

```js
PixelPlatformer.mount(hostElementOrId, {
  level,          // level object, JSON string, or built-in key ("level1", "level2")
  levelKey,       // built-in level used when `level` is empty
  lives,          // default 3
  autoStart,      // skip the title overlay
  onComplete(r),  // { completed, score, coins, timeLeft, timeSeconds, level }
  onGameOver(r)
});
PixelPlatformer.destroy();
PixelPlatformer.preview(hostElementOrId, level, levelKey); // static thumbnail
```

## Credits

Sprites: [Pixel Platformer](https://kenney.nl/assets/pixel-platformer) by Kenney, CC0 1.0 (see `KENNEY-LICENSE.txt`). Sounds are generated at runtime with WebAudio.
