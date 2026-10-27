# BeatForge — integration contract (engine ⇄ OutSystems app)

BeatForge is a music-creation app. The **OutSystems app** (screens, data, AI, sharing) hosts a
**JavaScript engine** (audio, studio UI, visualizer, VR) loaded from jsDelivr with SRI.

## 1. Files and hosting
- Engine source: `C:\Users\owenc\Downloads\OutSystems_Autonomous_Skill_Mock_POC\game\beatforge\` (inside the existing
  git repo `OwenDeco/OSPixelGame`, already authenticated via `gh`).
- Published bundle: `beatforge/dist/beatforge.js`, tag `beatforge-v1.0.1` →
  `https://cdn.jsdelivr.net/gh/OwenDeco/OSPixelGame@beatforge-v1.0.1/beatforge/dist/beatforge.js`
  (Tag `beatforge-v1.0.0` was pushed by mistake on a commit WITHOUT the engine; it is left untouched — do not use it.)
- Third-party libs (pinned, loaded by the OS app before the engine, each with `integrity` + `crossorigin="anonymous"`):
  - Tone.js 14.8.49: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js`
  - three.js r128: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
  (The engine agent computes and records the SRI `sha384-…` of all three files in `beatforge/SRI.txt`.)

## 2. Global API (window.BeatForge)
```js
BeatForge.version                       // "1.0.1"
BeatForge.mount(hostElOrId, opts)       // builds the whole studio UI inside host; returns instance
BeatForge.unmount()                     // stops audio + rAF + XR session, removes listeners/DOM
BeatForge.applySpec(specJsonString)     // load a song spec (from AI / saved song); sanitizes everything
BeatForge.getSpec()                     // -> current spec JSON string
BeatForge.setLyrics(text)               // set lyrics (from AI), plain text only
BeatForge.setBusy(isBusy, message)      // show/hide "AI is composing..." overlay
BeatForge.notify(message, kind)         // toast: kind = "info" | "error" | "success"
BeatForge.setVocalAudio(index, base64Audio, mimeType) // (v1 addition) premium vocal for line `index` (0..7), e.g. "audio/mpeg"/"audio/wav"; returns true if accepted
BeatForge.vocalAudioFailed(message)     // (v1 addition) premium voice failed -> engine falls back to Kokoro, then SpeechSynthesis
```
`mount` returns an object with the same methods (applySpec, getSpec, setLyrics, setBusy, notify, setVocalAudio,
vocalAudioFailed, unmount). Only one instance exists at a time (mounting again unmounts the previous one).
Engine behaviour the OS side can rely on:
- When the user clicks an AI button the engine shows the busy overlay itself; it is cleared automatically by the next
  `applySpec`, `setLyrics` or `notify(..., "error")` (or after 60 s). `setBusy(false)` also clears it.
- `applySpec` accepts a JSON string (or object); if the string has prose/code fences around the JSON, the outermost
  `{...}` is used. Missing fields keep their current values (so a partial "enhance" answer works). Returns false and
  shows an error toast for invalid JSON / non-object / > 20 KB.
- `setLyrics(text)` sets lyrics and, if text is non-empty and voice.mode is not lyrics/singer, switches voice.mode to "lyrics".
`opts`:
```js
{
  spec: "<spec json>" | "",            // initial song; "" -> default preset
  mode: "studio" | "listen",           // listen = read-only player + big visualizer + VR
  onAIRequest(kind, prompt, specJson),  // kind: "song" | "lyrics" | "enhance"; OS answers via applySpec/setLyrics/notify
  onSave(name, specJson),               // OS saves; answers via notify
  onChange(specJson),                   // optional, debounced 1s (OS may ignore)
  onVoiceRequest(linesJson, voiceName)  // optional (v1 addition): premium vocals. Fired when voice.mode="singer" and the
                                        // effective engine is "azure". linesJson = JSON array of <= 8 strings (<= 120 chars).
                                        // OS answers per line with setVocalAudio(i, base64, mime) or vocalAudioFailed(msg).
                                        // No answer within 30 s -> engine falls back to Kokoro.
}
```
Callbacks are fire-and-forget; the OS app replies by calling the API above from a JavaScript node.
The OS screen must call the callbacks' targets as literal `$actions.X(...)` inside its JavaScript node
(OutSystems only wires actions referenced literally).

## 3. Song spec v1 (JSON)
```json
{
  "version": 1,
  "name": "Midnight Drums",
  "bpm": 92,                    // 60..180
  "key": "A",                   // C C# D D# E F F# G G# A A# B
  "scale": "minor",             // major | minor | dorian | pentatonic | blues
  "swing": 0.15,                // 0..0.5
  "visual": "neon",             // neon | sunset | ocean | galaxy
  "fx": { "reverb": 0.3, "delay": 0.15, "lofi": 0.0 },   // 0..1
  "drums":  { "on": true, "kit": "808",                 // 808 | acoustic | lofi | electro
              "kick":[16 ints 0/1], "snare":[16], "hat":[16], "clap":[16], "perc":[16], "vol": 0.8 },
  "bass":   { "on": true, "sound": "sub", "notes":[16 of scale-degree 1..7 or 0=rest], "vol": 0.7 },   // sub | pluck | wobble
  "chords": { "on": true, "sound": "pad", "progression":[4 degrees 1..7], "vol": 0.5 },             // pad | keys | strings
  "melody": { "on": false, "sound": "lead", "notes":[16 degrees 0..14, 0=rest], "vol": 0.5 },      // lead | bell | flute
  "voice":  { "mode": "hum", "vol": 0.6,                // none | hum | ooh | aah | lyrics | singer
              "engine": "auto",                         // auto | azure | kokoro | browser (singer only)
              "voiceName": "en-US-AriaNeural" },        // <= 60 chars [A-Za-z0-9_-]; Azure names or Kokoro ids (af_heart, af_bella, am_michael, bm_george)
  "lyrics": ""                                          // <= 600 chars, plain text, lines separated by \n
}
```
Loop = 4 bars; the chord progression changes per bar; drum/bass/melody 16-step patterns repeat per bar.
**Bass degrees are relative to the current bar's chord root** (1 = chord root, 5 = fifth above it in the scale), so the
bass follows the progression. Melody degrees are absolute in the key (1..14 = two octaves). Unknown keys are ignored;
key also accepts flats/lowercase ("Bb" -> "A#").
Voice modes: hum/ooh/aah = in-engine formant synth (follows the melody if on, else chord tones). lyrics = browser
SpeechSynthesis, one line per bar + soft hum. singer = AI singer: each lyric line (or a vocalise if no lyrics) is rendered
once by the engine (`voice.engine`): "azure" = host-supplied audio via onVoiceRequest; "kokoro" = free in-browser
Kokoro-82M TTS (kokoro-js 1.2.1 from jsDelivr, model ~90 MB from huggingface.co, downloaded only when singer is
selected); "browser" = SpeechSynthesis; "auto" = Azure if onVoiceRequest is provided (and voiceName is not a Kokoro id),
else Kokoro. The audio is auto-tuned (TD-PSOLA) to the bar's melody/chord notes, time-fitted to the bar, and played on
the beat with chorus/slap-delay/reverb. Failures fall back Azure -> Kokoro -> browser voice; playback never waits.
**Both sides must treat every field as untrusted**: clamp numbers, whitelist enums, force arrays to length 16
(pad/truncate), cap strings (name 40, lyrics 600). The engine renders strings ONLY via `textContent`
(never innerHTML/eval). Max spec size 20 KB.

## 4. OutSystems side (summary)
- Entities: `Song` (Name, SpecJson ≤20000, ShareKey GUID, CreatedOn, Plays), `AiUsage` (Day, Count).
- Server actions: `GenerateSong(Prompt≤300, CurrentSpecJson)` and `GenerateLyrics(Prompt≤300, SpecJson)` via the
  **AzureHarmony** AI model connection, with a **global daily cap** (e.g. 300 AI calls/day → friendly message);
  `SaveSong(Name, SpecJson)` → ShareKey (validate size/length; songs are immutable, every save is a new song);
  `GetSong(ShareKey)`; `GetRecentSongs()` (top 24: Name, ShareKey, CreatedOn, Plays only).
- Screens: `Home` (hero, preset cards → Studio with preset, gallery), `Studio?ShareKey=` (engine in studio mode),
  `Listen?ShareKey=` (engine in listen mode, share link, VR button).
- Engine loading: one reusable client action that injects the 3 script tags in order with `integrity` and
  `crossOrigin="anonymous"`, waits for load, then mounts. URLs + hashes live in the app (Settings or constants).
- If a Content-Security-Policy is set, the free Kokoro singer additionally needs: script-src cdn.jsdelivr.net (dynamic
  ES-module import) + `'wasm-unsafe-eval'`, connect-src huggingface.co, *.hf.co, cdn.jsdelivr.net. Without them the singer
  falls back automatically (no SRI is possible for jsDelivr's generated +esm files).
- Viewer preferences (not in the spec): "Light show" off/chill/festival (default festival) and "Reduce flashing"
  (default ON: soft pulses only; when off, strobes are still rate-limited to <= 3 flashes/s; always soft in VR).
