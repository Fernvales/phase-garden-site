(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Theme preference is saved locally. If storage is unavailable, the page stays light.
  const themeButton = $('#theme-toggle');
  const themeLabel = $('#theme-label');
  const themeGlyph = $('.theme-glyph');
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('phase-garden-theme') === 'dark' ? 'dark' : 'light'; } catch {}
  document.body.dataset.theme = savedTheme;
  function setTheme(theme, redraw = true) {
    const dark = theme === 'dark';
    document.body.dataset.theme = dark ? 'dark' : 'light';
    themeButton?.setAttribute('aria-pressed', String(dark));
    themeButton?.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (themeLabel) themeLabel.textContent = dark ? 'light garden' : 'dark garden';
    if (themeGlyph) themeGlyph.textContent = dark ? '☀' : '☾';
    const themeMeta = $('meta[name="theme-color"]');
    themeMeta?.setAttribute('content', dark ? '#20231e' : '#f3efe5');
    try { localStorage.setItem('phase-garden-theme', dark ? 'dark' : 'light'); } catch {}
    if (redraw) plot();
  }
  setTheme(savedTheme, false);
  themeButton?.addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));

  // Mobile navigation
  const menuButton = $('#menu-toggle');
  const nav = $('#site-nav');
  const closeMenu = () => {
    if (!menuButton || !nav) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('is-open');
  };
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('is-open', open);
  });
  $$('#site-nav a').forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (innerWidth > 680) closeMenu(); }, { passive: true });

  // Flower details react gently to the pointer, but never block a control.
  const motes = $$('.ambient-petals span');
  if (!reducedMotion && motes.length) {
    let raf = 0, pointerX = innerWidth / 2, pointerY = innerHeight / 2;
    window.addEventListener('pointermove', event => {
      pointerX = event.clientX; pointerY = event.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        motes.forEach((mote, index) => {
          const rect = mote.getBoundingClientRect();
          const factor = .008 + (index % 3) * .003;
          mote.style.setProperty('--mx', `${Math.max(-18, Math.min(18, (pointerX - rect.left) * factor))}px`);
          mote.style.setProperty('--my', `${Math.max(-18, Math.min(18, (pointerY - rect.top) * factor))}px`);
        });
      });
    }, { passive: true });
  }
  if (!reducedMotion) {
    const symbols = ['✿', '❀', '✽'];
    document.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('a,button,input,canvas,summary,label,select,textarea')) return;
      if ($$('.floating-petal').length > 16) return;
      for (let i = 0; i < 3; i++) {
        const petal = document.createElement('span');
        petal.className = 'floating-petal'; petal.textContent = symbols[(Math.random() * symbols.length) | 0];
        petal.style.left = `${event.clientX + (Math.random() - .5) * 24}px`;
        petal.style.top = `${event.clientY + (Math.random() - .5) * 16}px`;
        petal.style.setProperty('--drift', `${(Math.random() - .5) * 75}px`);
        petal.style.setProperty('--fall', `${35 + Math.random() * 45}px`);
        petal.style.setProperty('--spin', `${(Math.random() - .5) * 130}deg`);
        document.body.appendChild(petal); petal.addEventListener('animationend', () => petal.remove(), { once: true });
      }
    });
  }

  // The little instrument drawing has quiet motion and stays decorative.
  const miniStems = $('.mini-stems');
  if (miniStems && !miniStems.children.length) {
    for (let i = 0; i < 16; i++) {
      const stem = document.createElement('span');
      stem.style.setProperty('--height', `${Math.max(18, 77 - i * 3.7)}%`);
      stem.style.setProperty('--delay', `${-(i % 8) * .42}s`);
      stem.innerHTML = `<i>✿</i><b></b><small>${i + 1}</small>`;
      miniStems.appendChild(stem);
    }
  }

  // The browser demo offers an additive tone plus a local-file effect chain.
  // Its sample processing is a practical Web Audio approximation, not the JUCE STFT engine.
  const canvas = $('#harmonic-canvas');
  const ctx = canvas?.getContext('2d');
  const listenButton = $('#listen-button');
  const listenLabel = $('#listen-label');
  const status = $('#synth-status');
  const footnote = $('#synth-footnote');
  const rootReadout = $('#root-readout-value');
  const rootNoteReadout = $('#root-note-name');
  const rootHz = 110;
  const count = 16;
  const base = Array.from({ length: count }, (_, i) => Math.min(1, 1.15 / (i + 1)));
  let levels = base.slice(), width = 0, height = 0, dpr = 1, hovered = -1, dragging = false;
  let audio = null, inputBus = null, shaper = null, master = null, echo = null, echoFeedback = null, echoWet = null;
  let voices = [], isPlaying = false, visualPhase = 0, raf = 0, lastAudioSync = 0;
  let sampleLoaded = false, sampleObjectUrl = null, sampleFile = null;
  let sampleDryElement = new Audio(), sampleWetElement = new Audio();
  let sampleDrySource = null, sampleWetSource = null, sampleDryGain = null, sampleWetGain = null;
  let sampleLowShelf = null, sampleFormantFilter = null, sampleToneFilter = null, sampleDynamics = null, samplePhaseDelay = null;
  let samplePartialFilters = [];
  sampleDryElement.preload = 'metadata'; sampleWetElement.preload = 'metadata';
  sampleDryElement.playsInline = true; sampleWetElement.playsInline = true;
  for (const element of [sampleDryElement, sampleWetElement]) {
    if ('preservesPitch' in element) element.preservesPitch = false;
    if ('webkitPreservesPitch' in element) element.webkitPreservesPitch = false;
    if ('mozPreservesPitch' in element) element.mozPreservesPitch = false;
  }
  const audioFileInput = $('#audio-file');
  const audioFileName = $('#sample-file-name');
  const audioFileDuration = $('#sample-file-duration');
  const audioFileStatus = $('#sample-loader-note');
  const clearAudioButton = $('#clear-audio');
  const sourceKind = $('#source-kind');
  const progressWrap = $('#sample-progress-wrap');
  const progressFill = $('#sample-progress-fill');
  const currentTimeLabel = $('#sample-current-time');
  const totalTimeLabel = $('#sample-total-time');
  const controlIds = ['shift','formant','stretch','pivot','bloom','tone','split','phase','emphasis','drift','twist','ghost','lock','trans','drive','mix'];
  const initialValues = { shift:0, formant:0, stretch:0, pivot:440, bloom:0, tone:0, split:0, phase:0, emphasis:0, drift:0, twist:0, ghost:0, lock:0, trans:0, drive:0, mix:1, follow:true };
  const inputs = Object.fromEntries(controlIds.map(name => [name, $(`#param-${name}`)]));
  const outputs = Object.fromEntries(controlIds.map(name => [name, $(`#out-${name}`)]));
  const read = name => Number(inputs[name]?.value ?? initialValues[name]);
  const values = () => ({ ...Object.fromEntries(controlIds.map(name => [name, read(name)])), follow: $('#param-follow')?.checked ?? true });
  const presets = {
    saw: () => base.slice(),
    hollow: () => base.map((v, i) => i % 2 === 0 ? v : 0),
    sine: () => base.map((v, i) => i === 0 ? 1 : 0),
    bell: () => base.map((v, i) => Math.max(0, Math.exp(-Math.pow((i - 3.1) / 2, 2))))
  };

  function noteName(freq) {
    const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
    const midi = Math.round(69 + 12 * Math.log2(Math.max(freq, 1) / 440));
    return `${names[(midi % 12 + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  }
  function showValues() {
    const p = values();
    const fmtPct = n => `${Math.round(n * 100)}%`;
    const formatted = {
      shift: `${p.shift > 0 ? '+' : ''}${p.shift.toFixed(1)} st`, formant: `${p.formant > 0 ? '+' : ''}${p.formant.toFixed(1)} st`,
      stretch: fmtPct(p.stretch), pivot: `${Math.round(p.pivot)} Hz`, bloom: fmtPct(p.bloom), tone: fmtPct(p.tone),
      split: p.split > .03 ? `Even -${Math.round(p.split * 100)}%` : p.split < -.03 ? `Odd -${Math.round(-p.split * 100)}%` : 'Both',
      phase: fmtPct(p.phase), emphasis: fmtPct(p.emphasis), drift: fmtPct(p.drift), twist: fmtPct(p.twist),
      ghost: p.ghost < .01 ? 'Off' : fmtPct(p.ghost), lock: fmtPct(p.lock), trans: fmtPct(p.trans), drive: fmtPct(p.drive), mix: fmtPct(p.mix)
    };
    for (const name of controlIds) {
      if (outputs[name]) outputs[name].textContent = formatted[name];
      const input = inputs[name];
      if (input && input.type === 'range') {
        const min = Number(input.min || 0), max = Number(input.max || 100), value = Number(input.value);
        const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
        input.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, percent))}%`);
      }
    }
    if (outputs.pivot) outputs.pivot.textContent = p.follow ? 'Follow' : `${Math.round(p.pivot)} Hz`;
    const pivotInput = inputs.pivot;
    if (pivotInput) {
      pivotInput.disabled = p.follow;
      const min = Number(pivotInput.min || 0), max = Number(pivotInput.max || 100), value = Number(pivotInput.value);
      const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
      pivotInput.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, percent))}%`);
    }
    const shiftedRoot = rootHz * Math.pow(2, p.shift / 12);
    if (rootReadout) rootReadout.innerHTML = `${Math.round(shiftedRoot)} <small>Hz</small>`;
    if (rootNoteReadout) rootNoteReadout.textContent = noteName(shiftedRoot);
    const rootLabel = $('#synth-root-label');
    if (rootLabel) rootLabel.textContent = `${Math.round(shiftedRoot)} Hz root`;
  }
  function processed(i, p, tSeconds) {
    const n = i + 1;
    const baseFreq = rootHz * n;
    const shiftRatio = Math.pow(2, p.shift / 12);
    const original = baseFreq;
    const activePivot = p.follow ? rootHz * Math.pow(2, p.shift / 12) : p.pivot;
    let stretchRatio = 1;
    if (p.stretch !== 0) {
      const relative = Math.max(original / activePivot, .25);
      const b = Math.abs(p.stretch) * .02;
      const q = Math.sqrt(Math.max(.1, 1 + b * (relative * relative - 1)));
      stretchRatio = p.stretch > 0 ? q : 1 / q;
    }
    const cents = p.drift * 45 * (.7 * Math.sin(tSeconds * (0.45 + i * .012) + i * 1.17) + .3 * Math.sin(tSeconds * .81 + i * 2.31));
    const driftRatio = Math.pow(2, cents / 1200);
    const preTwist = original * shiftRatio * stretchRatio * driftRatio;
    const twistHz = p.twist * 5 * Math.max(preTwist, 1) * .001 * Math.sqrt(Math.max(preTwist, 1) * .001);
    let targetFreq = Math.max(20, preTwist + twistHz);
    const lockedFreq = original * shiftRatio;
    targetFreq += (lockedFreq - targetFreq) * p.lock;
    const freq = original + (targetFreq - original) * p.mix;

    const center = 4 * Math.pow(2, p.formant / 12);
    const logN = Math.log(Math.max(n, .1));
    const baseEnvelope = Math.exp(-Math.pow(Math.log(4) - logN, 2) / (2 * .9 * .9));
    const movedEnvelope = Math.exp(-Math.pow(Math.log(center) - logN, 2) / (2 * .9 * .9));
    const formantGain = Math.max(.45, Math.min(2.2, Math.pow(movedEnvelope / Math.max(baseEnvelope, .15), .38)));
    const bloomDb = Math.max(-12, Math.min(12, p.bloom * 7 * Math.log2(Math.max(targetFreq, 20) / activePivot) / 3));
    const bloomGain = Math.pow(10, bloomDb / 20);
    const splitGain = p.split > 0 && n % 2 === 0 ? 1 - p.split : p.split < 0 && n % 2 === 1 ? 1 + p.split : 1;
    const toneGain = p.tone >= 0 ? 1 + p.tone * .22 * (n - 1) / (count - 1) : 1 + p.tone * .85;
    const emphasisExponent = 1 - p.emphasis * .75;
    const emphasisGain = Math.pow(Math.max(levels[i], .012), emphasisExponent) / Math.max(levels[i], .012);
    const transientEdge = 1 + p.trans * .18 * (n - 1) / (count - 1);
    const effectGain = Math.max(0, Math.min(2.5, formantGain * bloomGain * splitGain * toneGain * emphasisGain * transientEdge));
    const mixedGain = levels[i] * (1 + (effectGain - 1) * p.mix);
    const phaseDelay = p.phase * p.mix * (n % 2 === 0 ? .25 / Math.max(freq, 20) : 0);
    return { freq, gain: mixedGain, phaseDelay, baseFreq };
  }
  function updateDrive(amount) {
    if (!shaper) return;
    const n = 2048;
    const curve = new Float32Array(n);
    const drive = 1 + Math.max(0, amount) * 24;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / (n - 1) - 1;
      const shaped = Math.tanh(x * drive) / norm;
      curve[i] = x + (shaped - x) * Math.max(0, Math.min(1, amount));
    }
    shaper.curve = curve;
    shaper.oversample = amount > .25 ? '4x' : '2x';
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function syncAudio() {
    if (!audio) return;
    const p = values(), now = audio.currentTime, t = performance.now() / 1000;
    voices.forEach((voice, i) => {
      const model = processed(i, p, t);
      const frequency = Math.min(audio.sampleRate * .38, model.freq);
      voice.osc.frequency.setTargetAtTime(frequency, now, .035 + p.ghost * .22);
      voice.gain.gain.setTargetAtTime(sampleLoaded ? 0 : model.gain * .028, now, .025 + p.ghost * .32);
      voice.delay.delayTime.setTargetAtTime(Math.min(.05, model.phaseDelay), now, .04);
    });
    updateDrive(p.drive);
    if (echoFeedback) echoFeedback.gain.setTargetAtTime(p.ghost * p.mix * .42, now, .05);
    if (echoWet) echoWet.gain.setTargetAtTime(p.ghost * p.mix * .2, now, .05);
    if (echo) echo.delayTime.setTargetAtTime(.09 + p.ghost * .17, now, .05);

    // A local audio file gets a parallel dry/wet path. This is a browser-friendly
    // approximation of the plugin: the filters, stems, dynamics, delay, and drive
    // really do process the selected audio, but they are not the JUCE STFT engine.
    if (sampleLoaded && sampleDryGain && sampleWetGain && sampleLowShelf && sampleFormantFilter && sampleToneFilter && sampleDynamics && samplePhaseDelay) {
      const root = rootHz * Math.pow(2, p.shift / 12);
      const pivot = p.follow ? root : p.pivot;
      const shiftRatio = Math.pow(2, p.shift / 12);
      sampleDryElement.playbackRate = 1;
      sampleWetElement.playbackRate = shiftRatio;
      sampleLowShelf.gain.setTargetAtTime(p.tone * 9, now, .06);
      const formantCenter = clamp(pivot * 4 * Math.pow(2, p.formant / 12), 90, audio.sampleRate * .38);
      sampleFormantFilter.frequency.setTargetAtTime(formantCenter, now, .06);
      sampleFormantFilter.gain.setTargetAtTime(clamp(p.formant * .35 + p.bloom * 2, -9, 9), now, .06);
      sampleToneFilter.gain.setTargetAtTime(p.tone * 10, now, .06);
      sampleDynamics.threshold.setTargetAtTime(-24 + (p.emphasis < 0 ? p.emphasis * 8 : 0), now, .06);
      sampleDynamics.ratio.setTargetAtTime(1 + Math.abs(p.emphasis) * 5, now, .06);
      // Higher Transients settings lengthen the compressor attack and blend a
      // little original signal back in to keep the front edge of a hit.
      sampleDynamics.attack.setTargetAtTime(.003 + p.trans * .09, now, .06);
      sampleDynamics.release.setTargetAtTime(.12 + p.ghost * .35, now, .06);
      samplePhaseDelay.delayTime.setTargetAtTime(clamp(p.phase * .014 + Math.sin(t * 1.1) * p.twist * .003, 0, .025), now, .05);
      sampleDryGain.gain.setTargetAtTime(clamp((1 - p.mix) + p.trans * p.mix * .2, 0, 1), now, .035);
      sampleWetGain.gain.setTargetAtTime(clamp(p.mix * (1 - p.trans * .2), 0, 1), now, .035);

      samplePartialFilters.forEach((filter, i) => {
        const n = i + 1;
        const originalHz = rootHz * n;
        const activePivot = p.follow ? root : p.pivot;
        let stretchRatio = 1;
        if (p.stretch !== 0) {
          const relative = Math.max(originalHz / Math.max(activePivot, 20), .25);
          const b = Math.abs(p.stretch) * .02;
          const q = Math.sqrt(Math.max(.1, 1 + b * (relative * relative - 1)));
          stretchRatio = p.stretch > 0 ? q : 1 / q;
        }
        const cents = p.drift * 45 * (.7 * Math.sin(t * (.45 + i * .012) + i * 1.17) + .3 * Math.sin(t * .81 + i * 2.31));
        const driftRatio = Math.pow(2, cents / 1200);
        const preTwist = originalHz * shiftRatio * stretchRatio * driftRatio;
        const twistHz = p.twist * 5 * Math.max(preTwist, 1) * .001 * Math.sqrt(Math.max(preTwist, 1) * .001);
        let center = clamp(preTwist + twistHz, 35, audio.sampleRate * .42);
        const harmonicTarget = clamp(originalHz * shiftRatio, 35, audio.sampleRate * .42);
        center += (harmonicTarget - center) * p.lock;
        filter.frequency.setTargetAtTime(center, now, .055 + p.ghost * .18);
        filter.Q.setTargetAtTime(1.1 + p.lock * 5, now, .06);
        const stemDb = (levels[i] - base[i]) * 30;
        const bloomDb = p.bloom * 6 * Math.log2(Math.max(center, 20) / Math.max(activePivot, 20));
        const parityDb = p.split > 0 && n % 2 === 0 ? -24 * p.split : (p.split < 0 && n % 2 === 1 ? 24 * p.split : 0);
        const emphasisDb = p.emphasis * (levels[i] - base[i]) * 10;
        filter.gain.setTargetAtTime(clamp(stemDb + bloomDb + parityDb + emphasisDb, -30, 12), now, .06);
      });
    }
  }
  function makeAudio() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not available in this browser.');
    audio = new Ctor();
    inputBus = audio.createGain(); inputBus.gain.value = 1;
    shaper = audio.createWaveShaper();
    master = audio.createGain(); master.gain.value = 0;
    inputBus.connect(shaper); shaper.connect(master); master.connect(audio.destination);
    echo = audio.createDelay(.5); echoFeedback = audio.createGain(); echoWet = audio.createGain();
    echo.delayTime.value = .12; echoFeedback.gain.value = 0; echoWet.gain.value = 0;
    shaper.connect(echo); echo.connect(echoFeedback); echoFeedback.connect(echo); echo.connect(echoWet); echoWet.connect(master);
    voices = [];
    for (let i = 0; i < count; i++) {
      const osc = audio.createOscillator(), gain = audio.createGain(), delay = audio.createDelay(.1);
      osc.type = 'sine'; gain.gain.value = 0; delay.delayTime.value = 0;
      osc.connect(gain); gain.connect(delay); delay.connect(inputBus); osc.start();
      voices.push({ osc, gain, delay });
    }

    sampleDrySource = audio.createMediaElementSource(sampleDryElement);
    sampleWetSource = audio.createMediaElementSource(sampleWetElement);
    sampleDryGain = audio.createGain(); sampleDryGain.gain.value = 0;
    sampleWetGain = audio.createGain(); sampleWetGain.gain.value = 0;
    sampleLowShelf = audio.createBiquadFilter(); sampleLowShelf.type = 'lowshelf'; sampleLowShelf.frequency.value = 160;
    sampleFormantFilter = audio.createBiquadFilter(); sampleFormantFilter.type = 'peaking'; sampleFormantFilter.frequency.value = 440; sampleFormantFilter.Q.value = .8; sampleFormantFilter.gain.value = 0;
    sampleToneFilter = audio.createBiquadFilter(); sampleToneFilter.type = 'highshelf'; sampleToneFilter.frequency.value = 3200; sampleToneFilter.gain.value = 0;
    sampleDynamics = audio.createDynamicsCompressor(); sampleDynamics.threshold.value = -24; sampleDynamics.knee.value = 18; sampleDynamics.ratio.value = 1; sampleDynamics.attack.value = .003; sampleDynamics.release.value = .12;
    samplePhaseDelay = audio.createDelay(.05); samplePhaseDelay.delayTime.value = 0;
    sampleDrySource.connect(sampleDryGain); sampleDryGain.connect(master);
    sampleWetSource.connect(sampleLowShelf); sampleLowShelf.connect(sampleFormantFilter);
    let previous = sampleFormantFilter;
    samplePartialFilters = [];
    for (let i = 0; i < count; i++) {
      const filter = audio.createBiquadFilter();
      filter.type = 'peaking'; filter.frequency.value = rootHz * (i + 1); filter.Q.value = 1.1; filter.gain.value = 0;
      previous.connect(filter); previous = filter; samplePartialFilters.push(filter);
    }
    previous.connect(sampleToneFilter); sampleToneFilter.connect(sampleDynamics); sampleDynamics.connect(samplePhaseDelay); samplePhaseDelay.connect(sampleWetGain); sampleWetGain.connect(shaper);
    updateDrive(0);
    syncAudio();
  }

  function plot() {
    if (!ctx || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const darkCanvas = document.body.dataset.theme === 'dark';
    const left = 18, right = 18, top = 18, baseY = height - 30;
    const plotWidth = Math.max(1, width - left - right), plotHeight = Math.max(1, baseY - top), gap = plotWidth / count;
    for (let i = 0; i < 5; i++) {
      const y = top + plotHeight * i / 4;
      ctx.strokeStyle = i === 4 ? (darkCanvas ? 'rgba(237,227,210,.30)' : 'rgba(81,68,61,.27)') : (darkCanvas ? 'rgba(237,227,210,.10)' : 'rgba(81,68,61,.09)');
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
    }
    const p = values();
    ctx.beginPath();
    levels.forEach((level, i) => {
      const model = processed(i, p, performance.now() / 1000);
      const x = left + gap * (i + .5);
      const visualLevel = Math.max(0, Math.min(1, model.gain + (isPlaying && !reducedMotion ? Math.sin(visualPhase + i * .72) * .015 : 0)));
      const y = baseY - plotHeight * visualLevel;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(width - right, baseY); ctx.lineTo(left, baseY); ctx.closePath();
    ctx.fillStyle = darkCanvas ? 'rgba(142,169,131,.16)' : 'rgba(142,169,131,.09)'; ctx.fill();
    levels.forEach((level, i) => {
      const model = processed(i, p, performance.now() / 1000);
      const x = left + gap * (i + .5);
      const visualLevel = Math.max(0, Math.min(1, model.gain + (isPlaying && !reducedMotion ? Math.sin(visualPhase + i * .72) * .015 : 0)));
      const y = baseY - plotHeight * visualLevel;
      const color = i === hovered ? '#b96f66' : (i % 2 === 0 ? '#d98b82' : '#8ea983');
      ctx.globalAlpha = level < .015 ? .38 : .95;
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, Math.min(2.6, gap * .18));
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = color; ctx.font = `${i === hovered ? 17 : 14}px 'Patrick Hand', cursive`;
      ctx.textAlign = 'center'; ctx.fillText('✿', x, Math.max(top + 11, y - 3));
      ctx.fillStyle = darkCanvas ? '#b9ad99' : '#9c907f'; ctx.font = '13px "Patrick Hand", cursive'; ctx.fillText(String(i + 1), x, height - 7);
    });
    ctx.globalAlpha = 1;
  }
  function sizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); plot();
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  function updateSampleProgress() {
    if (!sampleLoaded || !sampleDryElement.duration || !Number.isFinite(sampleDryElement.duration)) return;
    if (progressWrap) progressWrap.hidden = false;
    const duration = sampleDryElement.duration;
    if (currentTimeLabel) currentTimeLabel.textContent = formatTime(sampleDryElement.currentTime);
    if (totalTimeLabel) totalTimeLabel.textContent = formatTime(duration);
    if (audioFileDuration) audioFileDuration.textContent = formatTime(duration);
    if (progressFill) progressFill.style.width = `${clamp(sampleDryElement.currentTime / duration * 100, 0, 100)}%`;
  }
  function syncSamplePositions() {
    if (!sampleLoaded) return;
    const position = sampleDryElement.currentTime || 0;
    if (Math.abs((sampleWetElement.currentTime || 0) - position) > .08) {
      try { sampleWetElement.currentTime = position; } catch {}
    }
  }
  function stopPlayback(statusText = 'Paused') {
    isPlaying = false;
    sampleDryElement.pause(); sampleWetElement.pause();
    if (audio && master) {
      const now = audio.currentTime;
      master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(0, now, .045);
    }
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (listenLabel) listenLabel.textContent = 'Listen';
    if (status) status.textContent = statusText;
    $('.synth-topline')?.classList.remove('is-playing');
    plot();
  }
  function loadSampleFile(file) {
    if (!file) return;
    const validAudio = (file.type && file.type.startsWith('audio/')) || /\.(wav|wave|mp3|m4a|aac|aif|aiff|ogg|flac|webm)$/i.test(file.name);
    if (!validAudio) {
      if (audioFileStatus) audioFileStatus.textContent = 'That file does not look like a supported audio format. Choose an audio file instead.';
      if (audioFileInput) audioFileInput.value = '';
      return;
    }
    stopPlayback('Loading audio…');
    if (sampleObjectUrl) URL.revokeObjectURL(sampleObjectUrl);
    sampleObjectUrl = URL.createObjectURL(file); sampleFile = file; sampleLoaded = true;
    sampleDryElement.src = sampleObjectUrl; sampleWetElement.src = sampleObjectUrl;
    sampleDryElement.load(); sampleWetElement.load();
    if (audioFileName) audioFileName.textContent = file.name;
    if (audioFileDuration) audioFileDuration.textContent = 'Reading file…';
    if (clearAudioButton) clearAudioButton.disabled = false;
    if (sourceKind) sourceKind.textContent = 'your audio';
    if (progressWrap) progressWrap.hidden = false;
    if (progressFill) progressFill.style.width = '0%';
    if (audioFileStatus) audioFileStatus.textContent = 'Loaded locally. Press Listen to audition it, then move the controls to shape it. The file is not uploaded.';
    if (footnote) footnote.textContent = 'Your audio stays on this device. Shift uses playback-rate pitch shifting in this browser demo, so it also changes playback speed.';
    if (status) status.textContent = `Loaded: ${file.name}`;
    if (listenLabel) listenLabel.textContent = 'Listen';
    if (audio) syncAudio();
    plot();
  }
  audioFileInput?.addEventListener('change', event => loadSampleFile(event.target.files?.[0]));
  const sampleLoader = $('#sample-loader');
  sampleLoader?.addEventListener('dragover', event => { event.preventDefault(); sampleLoader.classList.add('is-dragging'); });
  sampleLoader?.addEventListener('dragleave', event => { if (!sampleLoader.contains(event.relatedTarget)) sampleLoader.classList.remove('is-dragging'); });
  sampleLoader?.addEventListener('drop', event => {
    event.preventDefault(); sampleLoader.classList.remove('is-dragging');
    const file = [...(event.dataTransfer?.files || [])].find(item => (item.type && item.type.startsWith('audio/')) || /\.(wav|wave|mp3|m4a|aac|aif|aiff|ogg|flac|webm)$/i.test(item.name));
    if (file) loadSampleFile(file); else if (audioFileStatus) audioFileStatus.textContent = 'Drop an audio file here, such as WAV, MP3, or M4A.';
  });
  clearAudioButton?.addEventListener('click', () => {
    stopPlayback('Built-in tone selected');
    sampleLoaded = false; sampleFile = null;
    sampleDryElement.removeAttribute('src'); sampleWetElement.removeAttribute('src');
    sampleDryElement.load(); sampleWetElement.load();
    if (sampleObjectUrl) URL.revokeObjectURL(sampleObjectUrl);
    sampleObjectUrl = null;
    if (audioFileInput) audioFileInput.value = '';
    if (audioFileName) audioFileName.textContent = 'No audio selected';
    if (audioFileDuration) audioFileDuration.textContent = '';
    if (clearAudioButton) clearAudioButton.disabled = true;
    if (sourceKind) sourceKind.textContent = 'built-in tone';
    if (progressWrap) progressWrap.hidden = true;
    if (audioFileStatus) audioFileStatus.textContent = 'Works with browser-supported audio formats such as WAV, MP3, and M4A.';
    if (footnote) footnote.textContent = 'Built-in tone selected. Press Listen and shape the harmonics, or choose an audio file above.';
    if (audio) syncAudio();
    plot();
  });
  sampleDryElement.addEventListener('loadedmetadata', () => {
    if (!sampleLoaded) return;
    updateSampleProgress();
    if (audioFileStatus) audioFileStatus.textContent = 'Audio ready. Press Listen to play it through the browser effects.';
  });
  sampleDryElement.addEventListener('timeupdate', updateSampleProgress);
  sampleDryElement.addEventListener('ended', () => {
    if (!sampleLoaded || !isPlaying) return;
    const rate = Math.pow(2, read('shift') / 12);
    if (rate < 1) return; // The slowed wet copy ends later than the dry copy.
    stopPlayback('Audio finished');
    if (progressFill) progressFill.style.width = '100%';
  });
  sampleWetElement.addEventListener('ended', () => {
    if (!sampleLoaded || !isPlaying) return;
    const rate = Math.pow(2, read('shift') / 12);
    if (rate >= 1) stopPlayback('Audio finished');
  });
  async function toggleAudio() {
    try {
      if (!audio) makeAudio();
      if (isPlaying) {
        stopPlayback('Paused');
      } else {
        await audio.resume(); syncAudio();
        if (sampleLoaded) {
          if (sampleDryElement.ended || sampleWetElement.ended) { sampleDryElement.currentTime = 0; sampleWetElement.currentTime = 0; }
          syncSamplePositions();
          await Promise.all([sampleDryElement.play(), sampleWetElement.play()]);
        }
        const now = audio.currentTime, attack = .008 + (1 - read('trans')) * .18;
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(.75, now + attack);
        isPlaying = true;
        if (listenLabel) listenLabel.textContent = 'Pause';
        if (status) status.textContent = sampleLoaded ? `Playing: ${sampleFile?.name || 'audio file'}` : 'Playing built-in tone';
        if (!reducedMotion) raf = requestAnimationFrame(animate);
      }
      $('.synth-topline')?.classList.toggle('is-playing', isPlaying);
      plot();
    } catch (error) {
      console.error(error);
      stopPlayback('Audio unavailable');
      if (footnote) footnote.textContent = 'The browser could not play this file. Try a WAV, MP3, or M4A file and press Listen again.';
    }
  }

  function animate(now = 0) {
    if (!isPlaying) { raf = 0; return; }
    visualPhase += .035;
    if (now - lastAudioSync > 70) { syncAudio(); lastAudioSync = now; }
    plot(); raf = requestAnimationFrame(animate);
  }
  function stemIndex(event) {
    const rect = canvas.getBoundingClientRect(), left = 18, right = 18;
    const plotWidth = Math.max(1, width - left - right);
    return Math.max(0, Math.min(count - 1, Math.floor((event.clientX - rect.left - left) / (plotWidth / count))));
  }
  function setLevel(event) {
    if (hovered < 0) return;
    const rect = canvas.getBoundingClientRect(), top = 18, baseY = height - 30;
    levels[hovered] = Math.max(0, Math.min(1, (baseY - (event.clientY - rect.top)) / Math.max(1, baseY - top)));
    $$('.preset-button[data-preset]').forEach(button => button.classList.remove('is-active'));
    if (status) status.textContent = `Stem ${hovered + 1}`;
    if (footnote) footnote.textContent = `Partial ${hovered + 1} is now ${Math.round(levels[hovered] * 100)}%. The change updates the sound as you drag.`;
    plot(); syncAudio();
  }
  canvas?.addEventListener('pointerdown', event => { hovered = stemIndex(event); dragging = true; canvas.setPointerCapture?.(event.pointerId); setLevel(event); });
  canvas?.addEventListener('pointermove', event => {
    if (dragging) { hovered = stemIndex(event); setLevel(event); }
    else { hovered = stemIndex(event); plot(); }
  });
  const release = () => { dragging = false; };
  canvas?.addEventListener('pointerup', release); canvas?.addEventListener('pointercancel', release);
  canvas?.addEventListener('pointerleave', () => { if (!dragging) { hovered = -1; plot(); } });
  if (canvas && ctx) {
    if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(canvas);
    else window.addEventListener('resize', sizeCanvas, { passive: true });
    sizeCanvas();
  }

  $$('.preset-button[data-preset]').forEach(button => button.addEventListener('click', () => {
    levels = presets[button.dataset.preset]();
    $$('.preset-button[data-preset]').forEach(other => other.classList.toggle('is-active', other === button));
    if (status) status.textContent = `Preset: ${button.dataset.preset}`;
    if (footnote) footnote.textContent = 'Drag a flower stem, or move a control below, to keep shaping the sound.';
    plot(); syncAudio();
  }));
  $('#param-follow')?.addEventListener('change', () => { showValues(); syncAudio(); plot(); if (status) status.textContent = $('#param-follow').checked ? 'Following the root' : 'Pivot set by hand'; });
  controlIds.forEach(name => inputs[name]?.addEventListener('input', () => {
    showValues(); syncAudio(); plot();
    if (status) status.textContent = `${name === 'split' ? 'Odd / even' : name[0].toUpperCase() + name.slice(1)} adjusted`;
  }));
  $('#reset-controls')?.addEventListener('click', () => {
    Object.entries(initialValues).forEach(([name, value]) => { if (name === 'follow') { const follow = $('#param-follow'); if (follow) follow.checked = value; } else if (inputs[name]) inputs[name].value = value; });
    levels = base.slice();
    $$('.preset-button[data-preset]').forEach(button => button.classList.toggle('is-active', button.dataset.preset === 'saw'));
    showValues(); syncAudio(); plot();
    if (status) status.textContent = 'Ready to play';
    if (footnote) footnote.textContent = sampleLoaded ? 'Controls reset. Your selected file is still loaded; press Listen and shape it again.' : 'Controls reset. Press Listen, then adjust the stems or controls.';
  });
  listenButton?.addEventListener('click', toggleAudio);
  showValues();

  // Copy the macOS command, including when previewing from localhost.
  $('#copy-command')?.addEventListener('click', async () => {
    const command = $('#quarantine-command')?.textContent?.trim() || '';
    const label = $('#copy-label');
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(command);
      else {
        const area = document.createElement('textarea'); area.value = command;
        area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select();
        const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error('copy failed');
      }
      if (label) label.textContent = 'Copied';
      setTimeout(() => { if (label) label.textContent = 'Copy'; }, 1500);
    } catch { if (label) label.textContent = 'Select command'; }
  });
})();
