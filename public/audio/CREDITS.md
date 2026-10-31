# Audio credits

Phase three (2026-10-31) adds 10 original story cues, 14 original 12-second spatial/theme loops and 12 variations derived from the credited Kenney footstep/dice recordings below. Variations use resampling, filtering and short fades; source mappings and deterministic recipes are in `scripts/audio-spatial-recipes.mjs`. No speech recording or third-party music is added. Current total: 86 short cues/variations and 18 loops.

Phase two (2026-10-31) adds 36 original procedurally synthesized mechanism cues, bringing the total to 64 short cues and four loops. Recipes are in `scripts/audio-mechanism-recipes.mjs`: deterministic noise, envelopes, pitched partials and pulses; no external recordings or voice. The first bank described below is unchanged.

The first sound bank contains 28 short cues and four 24-second seamless loops.
All files are local; playback does not contact a third-party service.

## Kenney — CC0

- [Casino Audio 1.1](https://kenney.nl/assets/casino-audio): `card-slide-1`, `card-place-2`, `card-shove-1`, `dice-shake-1`, `die-throw-1`.
- [RPG Audio](https://kenney.nl/assets/rpg-audio): `doorOpen_1`, `bookPlace1`, `footstep00`, `footstep04`, `footstep02`, `knifeSlice`, `chop`.
- Author: Kenney Vleugels (Kenney.nl). [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Downloaded from the official site on 2026-10-29. Selected original OGGs and their supplied license files are preserved in `scripts/audio-source/`.
- Processing: mono 24 kHz WAV, leading-silence trim, short fades, peak normalization, slower enemy footstep; item/omen card cues add original synthesis. Exact mapping and processing are in `scripts/build-audio.mjs`.

## Original project synthesis

The remaining 16 result/transition cues and all four loops were composed and synthesized specifically for House of Omens by the project's generation script, using additive tones, envelopes and deterministic partials. They contain no third-party musical recordings or generated voice.

Loops: `lobby` (sparse minor-key bells), `exploreMusic` (low suspense), `hauntMusic` (dissonant pulse), `manor` (low architectural/wind-like ambience).

Rebuild with `node scripts/build-audio.mjs` (Node.js and FFmpeg). Normal builds use the checked-in WAVs and do not require FFmpeg. `lib/audio-assets.mjs` is the shared runtime/portable asset manifest.
