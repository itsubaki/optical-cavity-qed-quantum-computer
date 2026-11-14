import { TAU, abs2, fidelity, concurrence, simulateRabi, simulateKerr, simulateGate, KERR_BASIS } from './qed.js';

const $ = id => document.getElementById(id);
const PI = Math.PI, RAD = PI / 180;
const defaults = {
  gate: { input: 'plus0', delta: PI, phiA: 17.5 * RAD, phiB: 12.5 * RAD, compensate: true, construction: 'cnot' },
  rabi: { input: 'photon', g: 1, delta: 0, t: PI / 4 },
  kerr: { input: '11', ga: 1, gb: 1, delta: .5, t: .98 }
};
const settings = structuredClone(defaults);
const inputOptions = {
  gate: [['plus0', '|+0⟩\u2002Create a Bell state'], ['10', '|10⟩\u2002Observe the bit flip'], ['11', '|11⟩\u2002Reverse bit flip'], ['00', '|00⟩'], ['01', '|01⟩'], ['plus1', '|+1⟩'], ['uniform', '|++⟩\u2002Equal superposition']],
  rabi: [['photon', '|10⟩\u2002One photon, ground-state atom'], ['atom', '|01⟩\u2002Vacuum, excited atom'], ['superposition', '(|00⟩ + |10⟩)/√2\u2002Phase probe'], ['vacuum', '|00⟩\u2002No excitation']],
  kerr: [['11', '|11⟩\u2002One photon in each mode'], ['10', '|10⟩\u2002Mode a only'], ['01', '|01⟩\u2002Mode b only'], ['uniform', '|++⟩\u2002Optical superposition'], ['00', '|00⟩\u2002Both modes empty']]
};
let mode = 'rabi', stage = 4, snapshot, playing = false, animation, lastTime;
let sweepCache = null;
const clean = x => Math.abs(x) < .00005 ? 0 : x;
const fixed = (x, n = 3) => clean(x).toFixed(n);
const percent = x => `${fixed(100 * x, 1)}%`;
const degrees = x => x === null ? '—' : `${fixed(x / RAD, 1)}°`;
const ket = x => `|${x}⟩`;
function complex(z) {
  const [a, b] = z.map(clean);
  if (!b) return a.toFixed(3);
  if (!a) return `${b.toFixed(3)}i`;
  return `${a.toFixed(3)}${b < 0 ? '−' : '+'}${Math.abs(b).toFixed(3)}i`;
}
function angle(x) {
  for (const [v, label] of [[0, '0'], [PI / 4, 'π/4'], [PI / 2, 'π/2'], [PI, 'π'], [TAU, '2π']]) {
    if (Math.abs(x - v) < 1e-7) return label;
  }
  return `${fixed(x / PI)}π`;
}
const stageNames = () => ['Input', settings.gate.construction === 'cnot' ? 'After first H' : 'Before cavity', 'After cavity', 'Local correction', 'Output'];
function solve(s = settings[mode]) {
  return mode === 'gate' ? simulateGate(s) : mode === 'rabi' ? simulateRabi(s) : simulateKerr(s);
}
function stop() {
  playing = false; cancelAnimationFrame(animation); lastTime = null;
  $('play').setAttribute('aria-pressed', 'false');
  $('play').textContent = mode === 'gate' ? '▶ Sweep conditional phase' : '▶ Play time evolution';
}
function updateControls() {
  const s = settings[mode];
  $('input').value = s.input;
  $('phase').value = s.delta;
  $('phase-value').textContent = `${degrees(s.delta)} · ${angle(s.delta)}`;
  if (mode !== 'gate') {
    $('time').value = s.t; $('time-value').textContent = `${fixed(s.t)} · ${angle(s.t)}`;
    $('detuning').value = s.delta; $('detuning-value').textContent = fixed(s.delta);
    $('coupling').value = mode === 'rabi' ? s.g : s.ga;
    $('coupling-value').textContent = fixed(mode === 'rabi' ? s.g : s.ga);
    if (mode === 'kerr') { $('coupling-b').value = s.gb; $('coupling-b-value').textContent = fixed(s.gb); }
  } else {
    $('phi-a').value = fixed(s.phiA / RAD, 1); $('phi-b').value = fixed(s.phiB / RAD, 1);
    $('compensate').checked = s.compensate; $('construction').value = s.construction;
  }
}
function setMode(next) {
  stop(); mode = next; stage = 4; sweepCache = null;
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.mode === mode)); b.tabIndex = b.dataset.mode === mode ? 0 : -1;
  });
  $('experiment').setAttribute('aria-labelledby', `tab-${mode}`);
  $('input').innerHTML = inputOptions[mode].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  for (const id of ['construction-control', 'phase-control', 'local-controls']) $(id).hidden = mode !== 'gate';
  for (const id of ['time-control', 'detuning-control', 'coupling-control']) $(id).hidden = mode === 'gate';
  $('coupling-b-control').hidden = mode !== 'kerr';
  $('coupling-label').textContent = mode === 'rabi' ? 'Atom–field coupling g' : 'Mode a coupling gₐ';
  $('model-badge').textContent = mode === 'gate' ? 'IDEAL GATE' : 'CLOSED SYSTEM';
  $('view-title').textContent = { gate: 'Cavity-Mediated Quantum Gate', rabi: 'One Photon, One Atom', kerr: 'Two Modes, One Mediator' }[mode];
  $('view-badge').textContent = { gate: '2 PHOTON QUBITS', rabi: 'JAYNES–CUMMINGS', kerr: '3-LEVEL ATOM' }[mode];
  $('encoding').innerHTML = {
    gate: '|ab⟩ = |control, target⟩<br>0 / 1 = logical photonic states<div class="formula-line">Δ = π → controlled-Z<br>Hᵦ · CZ · Hᵦ = CNOT</div><div class="math-caption">Local phase compensation removes φₐ and φᵦ before the final H.</div>',
    rabi: '|n,s⟩ = |field, atom⟩<br>|10⟩ ↔ |01⟩<div class="formula-line">Ω = √(g² + δ²)<br>P(absorb) = (g²/Ω²) sin² Ωt</div><div class="math-caption">ℏ = 1 · Rotating frame · At most one total excitation.</div>',
    kerr: '|a,b,s⟩ = |mode a, mode b, atom⟩<br>Atomic states: 0, 1, 2<div class="formula-line">χ₃ = φₐᵦ − φₐ − φᵦ<br>Ωₐᵦ = √(δ² + gₐ² + gᵦ²)</div><div class="math-caption">The atom begins in 0. The full atom–field state includes absorption.</div>'
  }[mode];
  $('control-note').textContent = {
    gate: '“16°” recalls the historical experiment. “Ideal π” assumes the stronger conditional phase needed for CNOT; both use an ideal lossless gate.',
    rabi: 'Change detuning to suppress energy exchange. Try the phase-probe input to see the relative phase against vacuum.',
    kerr: '“Fig. 7.5” restores t = 0.98 and gₐ = gᵦ = 1. The nonlinear phase and absorption are calculated separately.'
  }[mode];
  const presets = { gate: [['zero', 'Δ = 0'], ['experiment', '16°'], ['ideal', 'Ideal π']], rabi: [['zero', 't = 0'], ['bell', 'Entangle'], ['swap', 'Transfer']], kerr: [['figure', 'Fig. 7.5'], ['resonance', 'δ = 0'], ['dispersive', 'δ = 4']] };
  $('presets').innerHTML = presets[mode].map(([name, label], i) => `<button data-preset="${name}" class="${i === 2 ? 'primary' : ''}">${label}</button>`).join('');
  $('stages').hidden = mode !== 'gate'; $('phase-readout').hidden = mode !== 'kerr';
  $('state-vector').className = `state-vector ${mode === 'rabi' ? 'three' : mode === 'kerr' ? 'eight' : ''}`;
  $('prob-title').textContent = mode === 'gate' ? 'Logical Measurement Probabilities' : mode === 'rabi' ? 'Atom–Field Populations' : 'Atomic Level Populations';
  $('sweep-title').textContent = { gate: 'Conditional Phase & Fidelity', rabi: 'Coherent Energy Exchange', kerr: 'Nonlinear Phase & Absorption' }[mode];
  $('chart-badge').textContent = mode === 'kerr' ? 'DETUNING SWEEP' : mode === 'rabi' ? 'TIME EVOLUTION' : 'FINAL OUTPUT';
  $('chart-note').textContent = {
    gate: 'Final-output curves for the chosen input and local phases, sweeping Δ from 0 to 2π. The plot always includes the complete gate sequence.',
    rabi: 'Populations for the chosen input as time varies, with g and δ fixed. Absorption here is reversible excitation of the atom.',
    kerr: 'Phase χ₃ (left, degrees) and absorption for initial |110⟩ (right, 0–1), with other parameters fixed. At the Fig. 7.5 preset the phase curve reproduces the textbook. The purple line marks δ.'
  }[mode];
  $('chart-legend').innerHTML = (mode === 'gate' ? [['green', 'State fidelity'], ['accent', 'P(11)']] : mode === 'rabi' ? [['green', 'Photon P(10)'], ['accent', 'Atom P(01)']] : [['green', 'χ₃ · degrees'], ['accent', 'P(absorb | 110)']]).map(([color, label]) => `<span><i class="dot" style="background:var(--${color})"></i>${label}</span>`).join('');
  updateControls(); stop(); refresh();
}
function renderState(state, labels) {
  $('state-vector').innerHTML = state.map((z, i) => `<div class="amplitude ${abs2(z) < 1e-10 ? 'zero' : ''}"><span class="phase-disc" aria-hidden="true"><i style="transform:rotate(${-Math.atan2(z[1], z[0])}rad)"></i></span><span class="ket">${labels[i]}</span><strong>${complex(z)}</strong><div class="phase-track"><i style="width:${100 * abs2(z)}%"></i></div></div>`).join('');
}
function renderBars(values, labels) {
  $('probability-bars').innerHTML = values.map((p, i) => `<div class="bar-item"><span class="ket">${labels[i]}</span><div class="bar-bg"><div class="bar-fill ${i === 0 ? 'green' : i === 2 ? 'violet' : ''}" style="width:${100 * Math.min(1, Math.max(0, p))}%"></div></div><span class="val">${percent(p)}</span></div>`).join('');
}
function refresh() {
  try {
    snapshot = solve(); const s = settings[mode], r = snapshot;
    $('error').textContent = '';
    let state, labels;
    if (mode === 'gate') {
      state = r.stages[stage]; labels = ['00', '01', '10', '11'].map(ket);
      const cnot = s.construction === 'cnot';
      $('stat1-label').textContent = `State fidelity with ideal ${cnot ? 'CNOT' : 'CZ'} output`;
      $('stat2-label').textContent = 'Entanglement · concurrence'; $('stat3-label').textContent = 'Conditional phase Δ';
      $('stat1').textContent = fixed(fidelity(state, r.ideal)); $('stat2').textContent = fixed(concurrence(state)); $('stat3').textContent = degrees(s.delta);
      $('stages').innerHTML = stageNames().map((name, i) => `<button data-stage="${i}" aria-pressed="${i === stage}">${name}</button>`).join('');
      $('stage-name').textContent = stageNames()[stage]; $('prob-badge').textContent = stageNames()[stage].toUpperCase();
      renderBars(state.map(abs2), labels);
      $('prob-note').textContent = 'Probabilities at the selected observation point. Equal probabilities can hide different relative phases; use the complex amplitudes and fidelity to distinguish them.';
      $('circuit-caption').textContent = cnot ? 'Mode a controls mode b. The cavity supplies the conditional phase; single-qubit phase corrections and two target Hadamards complete the construction.' : 'The cavity adds local and conditional phases. With local phases removed and Δ = π, the output is controlled-Z.';
      $('insight').textContent = Math.abs(s.delta - PI) < 1e-6 && s.compensate ? `At Δ = π, the complete sequence implements ${cnot ? 'CNOT. Try |10⟩ to see the target flip, or |+0⟩ to create a Bell pair.' : 'controlled-Z. Try |++⟩ to create maximal entanglement.'}` : Math.abs(s.delta - 16 * RAD) < 1e-6 ? 'Historical phase: Δ = 16°. This is a nontrivial interaction, but one such gate does not perform the π conditional phase required for CNOT.' : 'Move Δ to π and enable local phase compensation to obtain the ideal gate. A state fidelity of 1 for a particular input alone does not establish a CNOT for every input.';
      $('state-note').textContent = 'Each card shows a complex amplitude; its bar is |amplitude|². The small dial shows the phase. All displayed probabilities sum to 1.';
    } else if (mode === 'rabi') {
      state = r.state; labels = ['00', '01', '10'].map(ket);
      $('stat1-label').textContent = 'Photon population P(10)'; $('stat2-label').textContent = 'Atom–field concurrence'; $('stat3-label').textContent = 'Rabi frequency Ω';
      $('stat1').textContent = percent(r.photon); $('stat2').textContent = fixed(r.concurrence); $('stat3').textContent = fixed(r.omega);
      $('stage-name').textContent = `t = ${fixed(s.t)}`; $('prob-badge').textContent = 'FULL STATE';
      renderBars(r.probabilities, ['|00⟩ · vacuum', '|01⟩ · atom', '|10⟩ · photon']);
      $('prob-note').textContent = `Initial-photon absorption χᵣ = ${percent(r.absorption)}. Relative photon phase χᵢ = ${degrees(r.photonPhase)}${r.photonPhase === null ? ' (survival amplitude vanishes)' : ''}. These response values assume an initial photon, independently of the selected input.`;
      $('circuit-caption').textContent = 'A single mode of a Fabry–Perot cavity couples to a two-level atom. The drawing is schematic; its field brightness indicates photon population, not a classical electric-field expectation.';
      $('insight').textContent = s.g === 0 ? 'With g = 0 the atom and field cannot exchange energy.' : Math.abs(s.delta) < 1e-7 ? 'On resonance, excitation moves coherently between light and matter. A half transfer entangles them; a full transfer stores the excitation in the atom.' : 'Detuning reduces the maximum transfer probability to g²/(g² + δ²). The surviving photon can still acquire a phase relative to vacuum.';
      $('state-note').textContent = '|field, atom⟩ · Atomic 0 is ground, 1 is excited. |11⟩ is excluded by the single-total-excitation model.';
    } else {
      state = r.state; labels = KERR_BASIS.map(ket);
      $('stat1-label').textContent = 'Nonlinear phase χ₃'; $('stat2-label').textContent = 'Atomic excitation · chosen input'; $('stat3-label').textContent = 'Ground-state return';
      $('stat1').textContent = degrees(r.chi3); $('stat2').textContent = percent(r.absorbed); $('stat3').textContent = percent(r.returnProbability);
      $('stage-name').textContent = `t = ${fixed(s.t)}`; $('prob-badge').textContent = 'FULL STATE';
      renderBars([r.returnProbability, r.probabilities[2] + r.probabilities[6], r.probabilities[4] + r.probabilities[7]], ['s = 0 · ground', 's = 1 · excited', 's = 2 · excited']);
      $('phase-readout').innerHTML = [['φₐ', r.phiA], ['φᵦ', r.phiB], ['φₐᵦ', r.phiAB]].map(([name, value]) => `<span>${name} = <strong>${degrees(value)}</strong></span>`).join('');
      $('prob-note').textContent = 'Populations are summed over the optical modes for the selected input. Phases below describe separate one- and two-photon survival amplitudes; they do not depend on the chosen input.';
      $('circuit-caption').textContent = 'Two orthogonal optical modes couple to different transitions of the same three-level atom. Because the ground state is shared, their joint phase is not the sum of independent phases.';
      $('insight').textContent = r.chi3 === null ? 'A survival amplitude is zero here, so the corresponding phase and χ₃ are undefined. The state and absorption probabilities remain well defined.' : `The two-photon survival phase differs from the sum of the single-photon phases by ${degrees(r.chi3)}. Atomic excitation accompanies this nonlinear interaction; the optical evolution alone is not a lossless phase gate.`;
      $('state-note').textContent = '|a,b,atom⟩ · Full eight-state model; no postselection or renormalization. For example, |011⟩ means mode a was absorbed and the atom occupies level 1.';
    }
    renderState(state, labels); drawCircuit(); drawChart();
  } catch (error) { stop(); $('error').textContent = error.message; }
}
function drawCircuit() {
  const r = snapshot;
  const text = (x, y, label, small = false, extra = '') => `<text x="${x}" y="${y}" class="${small ? 'svg-small' : 'svg-label'}" ${extra}>${label}</text>`;
  const box = (x, y, w, h, label, klass = 'optical-box') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="${klass}"/>${text(x + w / 2, y + h / 2 + 5, label, false, 'text-anchor="middle"')}`;
  const mirrors = (x1, x2, y1, y2) => `<path d="M${x1} ${y1} Q${x1 + 20} ${(y1 + y2) / 2} ${x1} ${y2} M${x2} ${y1} Q${x2 - 20} ${(y1 + y2) / 2} ${x2} ${y2}" fill="none" stroke="#6facfa" stroke-width="5"/>`;
  let body;
  if (mode === 'gate') {
    const cnot = settings.gate.construction === 'cnot';
    body = text(20, 84, 'a · control') + text(20, 184, 'b · target') + '<path d="M111 80H603M111 180H603" class="rail active"/>';
    body += `<rect x="258" y="47" width="120" height="166" rx="13" fill="#18283d"/>${mirrors(270, 366, 59, 202)}<circle cx="318" cy="130" r="12" fill="#6bd9ad"/><path d="M318 90V113M318 147V170" stroke="#6bd9ad" stroke-dasharray="3 4"/>`;
    body += text(318, 32, 'Atom + cavity', true, 'text-anchor="middle"') + text(318, 238, `Δ = ${degrees(settings.gate.delta)}`, false, 'text-anchor="middle"');
    if (cnot) body += box(154, 160, 46, 40, 'H') + box(527, 160, 46, 40, 'H');
    body += box(424, 60, 48, 40, '−φₐ') + box(424, 160, 48, 40, '−φᵦ');
    if (!settings.gate.compensate) body += '<path d="M422 58l52 44M422 158l52 44" stroke="#ffbf77" stroke-width="2"/>';
    const marker = [120, 232, 397, 497, 596][stage];
    body += `<path d="M${marker} 50V211" stroke="#6bd9ad" stroke-width="1.5" stroke-dasharray="4 4"/>` + text(448, 238, 'Local correction', true, 'text-anchor="middle"');
  } else {
    const photon = mode === 'rabi' ? r.photon : r.probabilities[1] + r.probabilities[3] + 2 * r.probabilities[5] + r.probabilities[6] + r.probabilities[7];
    const excitation = mode === 'rabi' ? r.atom : r.absorbed;
    body = `<rect x="28" y="41" width="326" height="180" rx="14" fill="#111e30"/>${mirrors(66, 316, 63, 200)}`;
    const wave = (y, color) => `<path d="M80 ${y} Q96 ${y - 19} 112 ${y} T144 ${y} T176 ${y} T208 ${y} T240 ${y} T272 ${y} T304 ${y}" fill="none" stroke="${color}" stroke-width="2" opacity="${.2 + .65 * Math.min(1, photon)}"/>`;
    body += wave(mode === 'rabi' ? 132 : 110, '#6facfa');
    if (mode === 'kerr') body += wave(160, '#b59afa');
    body += `<circle cx="192" cy="132" r="${20 + 10 * excitation}" fill="#6bd9ad" opacity="${.05 + .25 * excitation}"/><circle cx="192" cy="132" r="10" fill="#6bd9ad"/>`;
    body += text(192, 29, 'Fabry–Perot cavity', true, 'text-anchor="middle"') + text(192, 243, 'One atom · coherent interaction', true, 'text-anchor="middle"');
    if (mode === 'rabi') {
      body += '<path d="M432 77H567M432 196H567" stroke="#6bd9ad" stroke-width="2"/><path d="M499 179V94" stroke="#6facfa" stroke-width="2" marker-start="url(#arrowBack)" marker-end="url(#arrow)"/>';
      body += text(581, 82, '|1⟩') + text(581, 201, '|0⟩') + text(514, 137, `g = ${fixed(settings.rabi.g, 2)}`, true) + text(500, 243, `δ = ${fixed(settings.rabi.delta, 2)}`, true, 'text-anchor="middle"');
    } else {
      body += '<path d="M403 76H465M535 76H597M467 196H533" stroke="#6bd9ad" stroke-width="2"/><path d="M491 181L444 93" stroke="#6facfa" stroke-width="2" marker-end="url(#arrow)"/><path d="M509 181L556 93" stroke="#b59afa" stroke-width="2" marker-end="url(#arrowViolet)"/>';
      body += text(425, 61, '|1⟩') + text(558, 61, '|2⟩') + text(487, 218, '|0⟩') + text(410, 148, 'a · gₐ', true) + text(553, 148, 'b · gᵦ', true);
    }
  }
  $('circuit').innerHTML = `<svg viewBox="0 0 630 270" role="img" aria-label="${$('circuit-caption').textContent}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="#6facfa"/></marker><marker id="arrowBack" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M10 0L0 5L10 10" fill="#6facfa"/></marker><marker id="arrowViolet" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="#b59afa"/></marker></defs>${body}</svg>`;
}
function chartSamples() {
  const s = settings[mode];
  const key = JSON.stringify(mode === 'gate' ? [mode, s.input, s.construction, s.compensate, s.phiA, s.phiB] : mode === 'rabi' ? [mode, s.input, s.g, s.delta] : [mode, s.ga, s.gb, s.t]);
  if (sweepCache?.key === key) return sweepCache;
  const min = mode === 'kerr' ? -4 : 0, max = mode === 'kerr' ? 4 : TAU;
  const samples = Array.from({ length: 321 }, (_, i) => {
    const x = min + (max - min) * i / 320;
    const r = solve({ ...s, [mode === 'rabi' ? 't' : 'delta']: x });
    return {
      x, a: mode === 'gate' ? r.fidelity : mode === 'rabi' ? r.photon : r.chi3 === null ? null : r.chi3 / RAD,
      b: mode === 'gate' ? r.probabilities[3] : mode === 'rabi' ? r.atom : r.twoPhotonAbsorption
    };
  });
  let phaseScale = mode === 'kerr' ? Math.max(25, ...samples.filter(p => p.a !== null).map(p => Math.ceil(Math.abs(p.a) / 5) * 5)) : 1;
  sweepCache = { key, min, max, samples, phaseScale }; return sweepCache;
}
function drawChart() {
  const canvas = $('chart'), rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1, w = rect.width, h = rect.height;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const left = 43, right = mode === 'kerr' ? 38 : 17, top = 20, bottom = 39;
  const cw = w - left - right, ch = h - top - bottom;
  const data = chartSamples(), isKerr = mode === 'kerr';
  const x = v => left + (v - data.min) / (data.max - data.min) * cw;
  const ya = v => top + (isKerr ? (data.phaseScale - v) / (2 * data.phaseScale) : 1 - v) * ch;
  const yb = v => top + (1 - v) * ch;
  ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = top + ch * i / 4;
    ctx.strokeStyle = '#243449'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
    ctx.fillStyle = '#a1b1c6'; ctx.textAlign = 'right';
    const tick = data.phaseScale * (1 - i / 2);
    ctx.fillText(isKerr ? `${fixed(tick, Number.isInteger(tick) ? 0 : 1)}°` : (1 - i / 4).toFixed(2), left - 8, y);
    if (isKerr) { ctx.textAlign = 'left'; ctx.fillStyle = '#6facfa'; ctx.fillText((1 - i / 4).toFixed(2), w - right + 6, y); }
  }
  const ticks = isKerr ? [[-4, '−4'], [-2, '−2'], [0, '0'], [2, '2'], [4, '4']] : [[0, '0'], [PI / 2, 'π/2'], [PI, 'π'], [3 * PI / 2, '3π/2'], [TAU, '2π']];
  ctx.textAlign = 'center'; ctx.fillStyle = '#a1b1c6';
  ticks.forEach(([v, label]) => ctx.fillText(label, x(v), h - bottom + 15));
  ctx.fillText(isKerr ? 'Detuning δ' : mode === 'rabi' ? 'Interaction time t' : 'Conditional phase Δ', left + cw / 2, h - 8);
  const path = (property, color, yFn) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); let previous = null;
    data.samples.forEach(p => {
      const v = p[property];
      if (v === null) { previous = null; return; }
      if (previous === null || (property === 'a' && isKerr && Math.abs(v - previous) > 180)) ctx.moveTo(x(p.x), yFn(v));
      else ctx.lineTo(x(p.x), yFn(v));
      previous = v;
    }); ctx.stroke();
  };
  path('b', '#6facfa', yb); path('a', '#6bd9ad', ya);
  const current = mode === 'rabi' ? settings.rabi.t : settings[mode].delta;
  ctx.strokeStyle = '#b59afa'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x(current), top); ctx.lineTo(x(current), top + ch); ctx.stroke(); ctx.setLineDash([]);
  canvas.setAttribute('aria-label', `${$('sweep-title').textContent}. ${$('chart-note').textContent} Current ${isKerr ? 'detuning' : mode === 'rabi' ? 'time' : 'phase'}: ${fixed(current)}.`);
}
function preset(name) {
  stop(); const s = settings[mode];
  if (mode === 'gate') {
    s.delta = { zero: 0, experiment: 16 * RAD, ideal: PI }[name];
    if (name === 'experiment') { s.phiA = 17.5 * RAD; s.phiB = 12.5 * RAD; }
    if (name === 'ideal') s.compensate = true;
    stage = 4;
  } else if (mode === 'rabi') {
    if (name === 'zero') s.t = 0;
    else { s.delta = 0; if (s.g < .25) s.g = 1; s.input = 'photon'; s.t = name === 'bell' ? PI / (4 * s.g) : PI / (2 * s.g); }
  } else if (name === 'figure') Object.assign(s, { ga: 1, gb: 1, t: .98, delta: .5 });
  else s.delta = name === 'resonance' ? 0 : 4;
  updateControls(); refresh();
}
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const modes = ['rabi', 'kerr', 'gate'];
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (modes.indexOf(mode) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    setMode(modes[index]); $(`tab-${mode}`).focus();
  });
});
$('input').addEventListener('change', () => { stop(); settings[mode].input = $('input').value; refresh(); });
$('construction').addEventListener('change', () => { stop(); settings.gate.construction = $('construction').value; refresh(); });
$('compensate').addEventListener('change', () => { stop(); settings.gate.compensate = $('compensate').checked; refresh(); });
for (const [id, property] of [['phase', 'delta'], ['time', 't'], ['detuning', 'delta'], ['coupling', 'g'], ['coupling-b', 'gb']]) {
  $(id).addEventListener('input', () => {
    stop(); const input = $(id); const value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value)));
    settings[mode][id === 'coupling' && mode === 'kerr' ? 'ga' : property] = value; updateControls(); refresh();
  });
}
for (const [id, property] of [['phi-a', 'phiA'], ['phi-b', 'phiB']]) {
  $(id).addEventListener('input', () => {
    stop(); const input = $(id);
    if (input.value === '' || !input.validity.valid) { $('error').textContent = 'Local phases must be between −180° and 180°.'; return; }
    settings.gate[property] = Number(input.value) * RAD; refresh();
  });
}
$('presets').addEventListener('click', event => { const button = event.target.closest('[data-preset]'); if (button) preset(button.dataset.preset); });
$('stages').addEventListener('click', event => { const button = event.target.closest('[data-stage]'); if (button) { stop(); stage = Number(button.dataset.stage); refresh(); } });
$('reset').addEventListener('click', () => { settings[mode] = structuredClone(defaults[mode]); setMode(mode); });
$('play').addEventListener('click', () => {
  if (playing) { stop(); return; }
  playing = true; lastTime = null; $('play').textContent = 'Ⅱ Pause evolution'; $('play').setAttribute('aria-pressed', 'true');
  const tick = time => {
    if (!playing) return;
    if (lastTime !== null) {
      const property = mode === 'gate' ? 'delta' : 't';
      settings[mode][property] = (settings[mode][property] + Math.min(80, time - lastTime) * TAU / 14000) % TAU;
    }
    lastTime = time; updateControls(); refresh();
    if (playing) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('resize', () => { if (snapshot) drawChart(); });
setMode('rabi');
