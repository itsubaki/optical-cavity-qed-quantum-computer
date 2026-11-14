import test from 'node:test';
import assert from 'node:assert/strict';
import { abs2, phase, inputState, rabiEvolution, simulateRabi, simulateKerr, simulateGate, KERR_BASIS } from '../public/qed.js';

const close = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
const normalized = state => close(state.reduce((sum, z) => sum + abs2(z), 0), 1);
const stateClose = (actual, expected) => actual.forEach((z, i) => z.forEach((v, j) => close(v, expected[i][j])));
// Independent matrix-series reference for exp(sign*i*H*t), not the simulator's analytic solution.
function expApply(H, state, t, sign) {
  let term = structuredClone(state), out = structuredClone(state);
  for (let k = 1; k < 100; k++) {
    term = H.map(row => {
      const v = row.reduce((a, h, j) => [a[0] + h * term[j][0], a[1] + h * term[j][1]], [0, 0]);
      return [-sign * t / k * v[1], sign * t / k * v[0]];
    });
    out = out.map((v, i) => [v[0] + term[i][0], v[1] + term[i][1]]);
    if (term.reduce((s, v) => s + abs2(v), 0) < 1e-30) break;
  }
  return out;
}

test('Rabi vacuum, complete transfer, and maximal entanglement', () => {
  const vacuum = simulateRabi({ input: 'vacuum', g: 1, delta: .7, t: 1.2 });
  close(vacuum.probabilities[0], 1);
  const transfer = simulateRabi({ t: Math.PI / 2 });
  close(transfer.atom, 1); close(transfer.photon, 0); close(transfer.concurrence, 0);
  assert.equal(transfer.photonPhase, null);
  const bell = simulateRabi({ t: Math.PI / 4 });
  close(bell.atom, .5); close(bell.photon, .5); close(bell.concurrence, 1);
  const reverse = simulateRabi({ input: 'atom', t: Math.PI / 2 });
  close(reverse.photon, 1);
});
test('Rabi detuned propagator agrees with independent matrix exponential on complex inputs', () => {
  const initial = [[.3, .1], [.4, -.2], [Math.sqrt(.7), 0]];
  for (const delta of [-1.3, 0, .8]) for (const g of [0, .7, 1.2]) {
    const H = [[delta, 0, 0], [0, -delta, g], [0, g, delta]];
    const evolved = rabiEvolution(initial, { g, delta, t: .83 });
    stateClose(evolved, expApply(H, initial, .83, -1)); normalized(evolved);
    stateClose(rabiEvolution(evolved, { g, delta, t: -.83 }), initial);
  }
});
test('Rabi suppression and zero-frequency limit stay finite', () => {
  for (const delta of [-4, -1, 0, 1, 4]) for (let t = 0; t <= 6; t += .2) {
    const r = simulateRabi({ delta, g: 1.2, t, input: 'superposition' });
    normalized(r.state); assert.ok(r.absorption <= 1.44 / (1.44 + delta ** 2) + 1e-12);
  }
  const r = simulateRabi({ g: 0, delta: 0, t: 5 });
  close(r.photon, 1); close(r.absorption, 0); close(r.photonPhase, 0);
  assert.throws(() => simulateRabi({ t: NaN }), RangeError);
});
test('Eight-state Kerr evolution agrees with matrix exponential of textbook blocks', () => {
  const { ga, gb, delta, t } = { ga: .8, gb: 1.3, delta: -.4, t: .98 };
  const H = Array.from({ length: 8 }, () => Array(8).fill(0));
  [-delta, -delta, delta, -delta, delta, -delta, delta, delta].forEach((v, i) => H[i][i] = v);
  for (const [i, j, g] of [[1, 2, ga], [3, 4, gb], [5, 6, ga], [5, 7, gb]]) H[i][j] = H[j][i] = g;
  for (const input of ['00', '01', '10', '11', 'uniform']) {
    const s = inputState(input), initial = Array.from({ length: 8 }, () => [0, 0]);
    [0, 3, 1, 5].forEach((index, i) => initial[index] = s[i]);
    const r = simulateKerr({ input, ga, gb, delta, t });
    stateClose(r.state, expApply(H, initial, t, 1)); normalized(r.state);
    close(r.returnProbability + r.absorbed, 1);
    close(r.absorbed, r.probabilities[2] + r.probabilities[4] + r.probabilities[6] + r.probabilities[7]);
  }
});
test('Kerr phase reproduces Fig. 7.5 symmetry and vanishes with a decoupled mode', () => {
  const positive = simulateKerr({ delta: .5 });
  const negative = simulateKerr({ delta: -.5 });
  assert.ok(positive.chi3 < 0); assert.ok(positive.chi3 / Math.PI * 180 < -15);
  close(positive.chi3, -negative.chi3); close(positive.absorbed, negative.absorbed);
  for (const delta of [-2, -.3, .6, 2]) {
    close(simulateKerr({ gb: 0, delta }).chi3, 0);
    close(simulateKerr({ ga: 0, delta }).chi3, 0);
  }
});
test('Kerr absorption is retained, phases become undefined at survival zeros', () => {
  const r = simulateKerr({ delta: 0, ga: 1, gb: 1, t: Math.PI / (2 * Math.SQRT2) });
  close(r.absorbed, 1); close(r.returnProbability, 0);
  assert.equal(r.conditional, null); assert.equal(r.phiAB, null); assert.equal(r.chi3, null);
  close(r.twoPhotonAbsorption, 1); assert.equal(KERR_BASIS.length, 8);
  for (let t = 0; t < 6; t += .17) for (const delta of [-4, 0, 4]) {
    const r = simulateKerr({ t, delta, input: 'uniform' }); normalized(r.state);
    close(r.returnProbability + r.absorbed, 1);
    if (r.conditional) normalized(r.conditional);
  }
});
test('Kerr zero coupling and zero time are identity with no nonlinear phase', () => {
  for (const opts of [{ ga: 0, gb: 0, delta: 0, t: 5 }, { t: 0, delta: 1.7 }]) {
    const r = simulateKerr({ ...opts, input: 'uniform' });
    close(r.absorbed, 0); close(r.chi3, 0); normalized(r.state);
  }
});
test('Compensated pi gate reproduces the complete CNOT truth table', () => {
  const expected = { '00': 0, '01': 1, '10': 3, '11': 2 };
  for (const [input, index] of Object.entries(expected)) {
    const r = simulateGate({ input, phiA: -.7, phiB: 1.3 });
    r.probabilities.forEach((v, i) => close(v, i === index ? 1 : 0));
    close(r.fidelity, 1); r.stages.forEach(normalized);
  }
  const bell = simulateGate();
  stateClose(bell.output, [[Math.SQRT1_2, 0], [0, 0], [0, 0], [Math.SQRT1_2, 0]]);
  close(bell.concurrence, 1);
});
test('Controlled-Z includes phases invisible in probabilities', () => {
  const r = simulateGate({ construction: 'phase', input: 'uniform' });
  stateClose(r.output, [[.5, 0], [.5, 0], [.5, 0], [-.5, 0]]);
  close(r.concurrence, 1); close(r.fidelity, 1);
  const identity = simulateGate({ construction: 'phase', input: 'uniform', delta: 0 });
  identity.probabilities.forEach(v => close(v, .25)); close(identity.concurrence, 0); close(identity.fidelity, .25);
});
test('Local phases attach to the named modes and compensation removes them', () => {
  for (const [input, shift] of [['00', 0], ['01', .4], ['10', .7], ['11', 1.3]]) {
    const r = simulateGate({ construction: 'phase', input, delta: .2, phiA: .7, phiB: .4, compensate: false });
    const index = ['00', '01', '10', '11'].indexOf(input);
    stateClose([r.output[index]], [phase([1, 0], shift)]);
  }
  const corrected = simulateGate({ input: 'plus0', phiA: .7, phiB: .4 });
  const raw = simulateGate({ input: 'plus0', phiA: .7, phiB: .4, compensate: false });
  close(corrected.fidelity, 1); assert.ok(raw.fidelity < .99);
});
test('Historical 16 degree interaction is distinct from an ideal CNOT', () => {
  const delta = 16 * Math.PI / 180, r = simulateGate({ delta });
  close(r.concurrence, Math.sin(delta / 2)); assert.ok(r.fidelity < .3);
  for (const input of ['00', '01', '10', '11', 'plus0', 'plus1', 'uniform']) {
    for (const delta of [0, .3, Math.PI, 2 * Math.PI]) {
      const r = simulateGate({ input, delta, compensate: false }); r.stages.forEach(normalized);
    }
  }
  assert.throws(() => simulateGate({ construction: 'other' }), RangeError);
  assert.throws(() => simulateKerr({ input: '__proto__' }), RangeError);
});
