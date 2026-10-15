# Phase Garden (web)

A static HTML, CSS, and JavaScript site. It does not need Node, npm, or a build step.

## Run locally

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run `python3 -m http.server 5500`.
4. Visit `http://localhost:5500`.

Start the server from the folder containing `index.html`. If the browser shows a directory listing, you're one folder too high.

## Playground

- Press **Listen** with no file selected to play the built-in 16-partial tone.
- Choose or drop an audio file into the playground to hear it through the browser's effect chain.
- Shift, formant, stretch, pivot, bloom, tone, odd/even balance, phase, emphasis, drift, twist, ghost, lock, transients, drive, mix, and the draggable harmonic stems change the browser demo.
- The file stays on the visitor's device. The page does not upload it to a server.
- Supported formats depend on the browser. WAV, MP3, and M4A are common choices.
- The browser demo is not the full JUCE processor. In particular, Shift uses playback-rate pitch shifting and therefore also changes playback speed; the 16 stems are a small filter bank, not the plugin's exact spectral engine.
- The **dark garden** button switches themes. The preference is stored locally in that browser.

## Plugin downloads

Put real release archives in `downloads/` with these exact filenames:

- `Phase_Garden_vst3.zip`
- `Phase-Garden-macOS-VST3.tar`
- `Phase-Garden-macOS-AU.tar.gz`

Don't create placeholder or empty archives. The download buttons link to these files directly. The AU archive should contain `Phase Garden.component`; install it in `~/Library/Audio/Plug-Ins/Components`. The VST3 bundles belong in their respective VST3 plug-in folders.

## Deploying

This is a plain static site. For Vercel, import the repository with Framework Preset **Other**, no build or install command, and output directory `.`. Ensure `index.html`, `css/`, `js/`, and `downloads/` are at the repository root.
