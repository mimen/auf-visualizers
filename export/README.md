# Visualizer export

Renders a release as video files with the Liquid Light background and the flowing-ridges waveform.

## Run

```sh
npm install && npx playwright install chromium-headless-shell   # once
npm run export -- export/releases/turbo.json                     # all three formats
npm run export -- export/releases/turbo.json story reels --fps 30
```

Files land in `export/out/<release>-<format>.mp4` as H.264 with 320 kbps AAC audio.

| Format | Size | Length | Layout |
|---|---|---|---|
| `youtube` | 1920x1080 | Whole track | Cover left, title and waveform right |
| `story` | 1080x1920 | `clip` from the release file | Empty band at y 1484 to 1684 for the link sticker |
| `reels` | 1080x1920 | `clip` from the release file | No sticker band. Everything sits above Instagram's caption and buttons, which cover the bottom 420 px and the right 120 px |

Pass `--full` to render the whole track for `story` or `reels`.

## Add a release

Copy `releases/turbo.json` and edit it. `audio` is the master file (WAV is best). `cover` and `illo` are paths relative to the JSON file. `clip.start` and `clip.duration` choose the excerpt, in seconds, for story and reels. `bpm` sets the beat clock that spaces the ridge lines.

## Check a layout

Open `render.html?format=story&guides` from a static server at the repo root. `guides` draws the sticker slot (story) or the Instagram overlay zones (reels). Without it, nothing is drawn in those areas.

## How it works

`render.html` analyses the whole track once ahead of time, then draws any timestamp on request. `export.mjs` serves the repo, steps through the page frame by frame in headless Chromium, and pipes the PNGs into ffmpeg with the matching slice of the master audio. Picture and sound line up exactly because the frames are timestamped instead of played back live.
