(function () {
  'use strict';

  // ---------- constants ----------
  const ABS_ZERO_C = -273.15;
  const EPSILON = 1e-6;

  // visual scale for the thermometer tube, in Celsius
  const SCALE_MIN_C = -40;
  const SCALE_MAX_C = 120;

  const TUBE_TOP_Y = 18;
  const TUBE_BOTTOM_Y = 288;
  const TUBE_HEIGHT = TUBE_BOTTOM_Y - TUBE_TOP_Y;

  const COLD = [43, 108, 176];   // --cold
  const NEUTRAL = [91, 102, 112]; // --ink-muted
  const HOT = [214, 71, 43];      // --hot
  const WARN = [201, 138, 27];    // --warn

  // ---------- elements ----------
  const tempInput = document.getElementById('tempInput');
  const unitSelect = document.getElementById('unitSelect');
  const fieldMsg = document.getElementById('fieldMsg');
  const convertBtn = document.getElementById('convertBtn');

  const thermoFill = document.getElementById('thermoFill');
  const thermoBulb = document.getElementById('thermoBulb');
  const thermoState = document.getElementById('thermoState');
  const thermoTicks = document.getElementById('thermoTicks');

  const tileC = document.getElementById('tileC');
  const tileF = document.getElementById('tileF');
  const tileK = document.getElementById('tileK');
  const valC = document.getElementById('valC');
  const valF = document.getElementById('valF');
  const valK = document.getElementById('valK');

  const confirmMsg = document.getElementById('confirmMsg');

  const tiles = { C: tileC, F: tileF, K: tileK };
  const vals = { C: valC, F: valF, K: valK };

  // ---------- build tick marks once ----------
  (function buildTicks() {
    const count = 8;
    for (let i = 0; i <= count; i++) {
      const y = TUBE_TOP_Y + (TUBE_HEIGHT / count) * i;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '80');
      line.setAttribute('x2', i % 2 === 0 ? '90' : '86');
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      thermoTicks.appendChild(line);
    }
  })();

  // ---------- conversion helpers ----------
  function toCelsius(value, unit) {
    if (unit === 'C') return value;
    if (unit === 'F') return (value - 32) * 5 / 9;
    return value - 273.15; // K
  }

  function fromCelsius(celsius, unit) {
    if (unit === 'C') return celsius;
    if (unit === 'F') return celsius * 9 / 5 + 32;
    return celsius + 273.15; // K
  }

  function unitLabel(unit) {
    return unit === 'C' ? '°C' : unit === 'F' ? '°F' : 'K';
  }

  // ---------- input classification ----------
  // returns { state: 'empty' | 'incomplete' | 'invalid' | 'valid', value? }
  function classify(raw) {
    const s = raw.trim();
    if (s === '') return { state: 'empty' };
    if (!/^-?\d*\.?\d*$/.test(s)) return { state: 'invalid' };
    if (s === '-' || s === '.' || s === '-.') return { state: 'incomplete' };
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { state: 'invalid' };
    return { state: 'valid', value: parseFloat(s) };
  }

  // ---------- color interpolation ----------
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mixColor(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }

  function colorForPercent(percent) {
    const rgb = percent <= 0.5
      ? mixColor(COLD, NEUTRAL, percent / 0.5)
      : mixColor(NEUTRAL, HOT, (percent - 0.5) / 0.5);
    return 'rgb(' + rgb.join(',') + ')';
  }

  function rgbString(arr) { return 'rgb(' + arr.join(',') + ')'; }

  // ---------- thermometer rendering ----------
  function setThermometer(celsius, opts) {
    opts = opts || {};
    if (opts.violation) {
      thermoFill.setAttribute('y', TUBE_BOTTOM_Y);
      thermoFill.setAttribute('height', 0);
      thermoBulb.setAttribute('fill', rgbString(WARN));
      return;
    }
    if (celsius === null) {
      thermoFill.setAttribute('y', TUBE_BOTTOM_Y);
      thermoFill.setAttribute('height', 0);
      thermoBulb.setAttribute('fill', rgbString(NEUTRAL));
      return;
    }
    const clamped = Math.min(SCALE_MAX_C, Math.max(SCALE_MIN_C, celsius));
    const percent = (clamped - SCALE_MIN_C) / (SCALE_MAX_C - SCALE_MIN_C);
    const fillHeight = percent * TUBE_HEIGHT;
    const fillY = TUBE_BOTTOM_Y - fillHeight;
    const color = colorForPercent(percent);

    thermoFill.setAttribute('y', fillY);
    thermoFill.setAttribute('height', fillHeight);
    thermoFill.setAttribute('fill', color);
    thermoBulb.setAttribute('fill', color);
  }

  // ---------- message helpers ----------
  function showMessage(text, type) {
    fieldMsg.textContent = text;
    fieldMsg.hidden = false;
    fieldMsg.classList.toggle('warn', type === 'warn');
    tempInput.classList.toggle('is-invalid', type === 'error');
    tempInput.classList.toggle('is-warn', type === 'warn');
  }

  function clearMessage() {
    fieldMsg.hidden = true;
    fieldMsg.textContent = '';
    fieldMsg.classList.remove('warn');
    tempInput.classList.remove('is-invalid', 'is-warn');
  }

  function clearReadouts() {
    valC.textContent = '—';
    valF.textContent = '—';
    valK.textContent = '—';
    Object.values(tiles).forEach(t => t.classList.remove('is-source', 'is-locked'));
  }

  // ---------- core live update ----------
  function liveUpdate() {
    confirmMsg.hidden = true;
    Object.values(tiles).forEach(t => t.classList.remove('is-locked'));

    const raw = tempInput.value;
    const unit = unitSelect.value;
    const result = classify(raw);

    if (result.state === 'empty' || result.state === 'incomplete') {
      clearMessage();
      clearReadouts();
      setThermometer(null);
      thermoState.textContent = 'Awaiting input';
      convertBtn.disabled = true;
      return;
    }

    if (result.state === 'invalid') {
      showMessage('Enter a numeric value — digits, an optional leading “−”, and at most one decimal point.', 'error');
      clearReadouts();
      setThermometer(null);
      thermoState.textContent = 'Invalid input';
      convertBtn.disabled = true;
      return;
    }

    // valid number — check absolute zero
    const celsius = toCelsius(result.value, unit);
    if (celsius < ABS_ZERO_C - EPSILON) {
      showMessage(
        'That’s below absolute zero (' + ABS_ZERO_C + '°C / −459.67°F / 0 K) — the coldest temperature physically possible. Enter a value at or above it.',
        'warn'
      );
      clearReadouts();
      setThermometer(null, { violation: true });
      thermoState.textContent = 'Below absolute zero';
      convertBtn.disabled = true;
      return;
    }

    // fully valid — live preview
    clearMessage();
    convertBtn.disabled = false;

    const c = celsius;
    const f = fromCelsius(c, 'F');
    const k = fromCelsius(c, 'K');

    valC.textContent = c.toFixed(2) + ' °C';
    valF.textContent = f.toFixed(2) + ' °F';
    valK.textContent = k.toFixed(2) + ' K';

    Object.entries(tiles).forEach(([u, tile]) => {
      tile.classList.toggle('is-source', u === unit);
    });

    setThermometer(c);
    thermoState.textContent = result.value.toFixed(2) + ' ' + unitLabel(unit) + ' entered';
  }

  // ---------- convert (lock in) ----------
  function handleConvert() {
    const raw = tempInput.value;
    const unit = unitSelect.value;
    const result = classify(raw);
    if (result.state !== 'valid') return;

    const celsius = toCelsius(result.value, unit);
    if (celsius < ABS_ZERO_C - EPSILON) return;

    // re-run live update to ensure readouts are current, then lock
    liveUpdate();

    Object.values(tiles).forEach(t => t.classList.add('is-locked'));

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    confirmMsg.textContent = 'Converted at ' + time + ' — reading locked in from ' + unitLabel(unit) + '.';
    confirmMsg.hidden = false;

    thermoState.textContent = 'Converted · ' + time;
  }

  // ---------- events ----------
  tempInput.addEventListener('input', liveUpdate);
  unitSelect.addEventListener('change', liveUpdate);
  convertBtn.addEventListener('click', handleConvert);

  // ---------- initial state ----------
  clearReadouts();
  setThermometer(null);
})();
