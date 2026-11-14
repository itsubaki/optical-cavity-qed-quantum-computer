// Complex amplitudes are [real, imaginary]. All times/frequencies use ℏ = 1.
export const TAU = 2 * Math.PI;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const abs2 = a => a[0] ** 2 + a[1] ** 2;
export const phase = (a, x) => mul(a, [Math.cos(x), Math.sin(x)]);
export const probabilities = state => state.map(abs2);
const clone = state => state.map(a => [...a]);
const S = Math.SQRT1_2;
const INPUTS = {
  '00': [1, 0, 0, 0], '01': [0, 1, 0, 0], '10': [0, 0, 1, 0], '11': [0, 0, 0, 1],
  plus0: [S, 0, S, 0], plus1: [0, S, 0, S], uniform: [.5, .5, .5, .5],
  phaseProbe: [S, 0, 0, S]
};

function finite(...xs) {
  if (xs.some(x => !Number.isFinite(x))) throw new RangeError('Parameters must be finite numbers');
}
export function inputState(name) {
  if (!Object.hasOwn(INPUTS, name)) throw new RangeError('Unknown input state');
  return INPUTS[name].map(x => [x, 0]);
}
export function fidelity(a, b) {
  const overlap = a.reduce((s, v, i) => add(s, mul([v[0], -v[1]], b[i])), [0, 0]);
  return Math.min(1, Math.max(0, abs2(overlap)));
}
export function concurrence(state) {
  const a = mul(state[0], state[3]), b = mul(state[1], state[2]);
  return Math.min(1, 2 * Math.hypot(a[0] - b[0], a[1] - b[1]));
}
export function argument(a) {
  return abs2(a) < 1e-20 ? null : Math.atan2(a[1], a[0]);
}
const sincTime = (omega, t) => omega === 0 ? t : Math.sin(omega * t) / omega;

// Eq. (7.77) is the convention used here, with basis |field, atom>.
// Its generator is diag(delta, -delta, delta) with H_01,10 = H_10,01 = g.
// The sign inconsistencies of the printed Eq. (7.76) are not propagated.
export function rabiEvolution(state, { g = 1, delta = 0, t = 0 } = {}) {
  finite(g, delta, t);
  if (state.length !== 3) throw new RangeError('Use the single-excitation basis 00, 01, 10');
  const omega = Math.hypot(g, delta), s = sincTime(omega, t), c = Math.cos(omega * t);
  return [phase(state[0], -delta * t),
  add(mul([c, delta * s], state[1]), mul([0, -g * s], state[2])),
  add(mul([0, -g * s], state[1]), mul([c, -delta * s], state[2]))];
}
export function simulateRabi({ input = 'photon', g = 1, delta = 0, t = 0 } = {}) {
  const values = { photon: [0, 0, 1], atom: [0, 1, 0], vacuum: [1, 0, 0], superposition: [S, 0, S] }[input];
  if (!values) throw new RangeError('Unknown Rabi input');
  const initial = values.map(x => [x, 0]);
  const state = rabiEvolution(initial, { g, delta, t });
  const omega = Math.hypot(g, delta), s = sincTime(omega, t);
  const survival = phase([Math.cos(omega * t), -delta * s], delta * t);
  return {
    initial, state, probabilities: probabilities(state), omega,
    photon: abs2(state[2]), atom: abs2(state[1]),
    concurrence: concurrence([...state, [0, 0]]),
    absorption: g * g * s * s, photonPhase: argument(survival)
  };
}

export const KERR_BASIS = ['000', '100', '001', '010', '002', '110', '011', '102'];
// Eqs. (7.82)-(7.85): use U = exp(+i H t), as specified below (7.85),
// to reproduce Eq. (7.86) and Fig. 7.5. This convention is explicit because
// the text also uses exp(-i H t) elsewhere. Populations are unchanged by conjugation.
export function simulateKerr({ input = '11', ga = 1, gb = 1, delta = .5, t = .98 } = {}) {
  finite(ga, gb, delta, t);
  const initial = inputState(input);
  const block = coupling => {
    const omega = Math.hypot(delta, coupling), s = sincTime(omega, t);
    return { stay: [Math.cos(omega * t), -delta * s], s };
  };
  const a = block(ga), b = block(gb), ab = block(Math.hypot(ga, gb));
  const vacuum = phase([1, 0], -delta * t);
  const state = [mul(vacuum, initial[0]), mul(a.stay, initial[2]), mul([0, ga * a.s], initial[2]),
  mul(b.stay, initial[1]), mul([0, gb * b.s], initial[1]), mul(ab.stay, initial[3]),
  mul([0, ga * ab.s], initial[3]), mul([0, gb * ab.s], initial[3])];
  const relative = z => phase(z, delta * t);
  const ra = relative(a.stay), rb = relative(b.stay), rab = relative(ab.stay);
  const phiA = argument(ra), phiB = argument(rb), phiAB = argument(rab);
  // arg(r_ab / (r_a r_b)), computed without division near a zero.
  const singleProduct = mul(ra, rb);
  const chi3 = [phiA, phiB, phiAB].includes(null) ? null : argument(mul(rab, [singleProduct[0], -singleProduct[1]]));
  const p = probabilities(state);
  const absorbed = p[2] + p[4] + p[6] + p[7];
  const ground = [state[0], state[3], state[1], state[5]];
  // Conditional optical state is displayed only when ground-state return is possible.
  const returnProbability = ground.reduce((s, z) => s + abs2(z), 0);
  const conditional = returnProbability < 1e-12 ? null : ground.map(z => scale(z, 1 / Math.sqrt(returnProbability)));
  return {
    initial, state, probabilities: p, phiA, phiB, phiAB, chi3,
    absorbed, returnProbability, conditional, twoPhotonAbsorption: (ga * ga + gb * gb) * ab.s * ab.s
  };
}

export function hadamardTarget(state) {
  return [scale(add(state[0], state[1]), S), scale(add(state[0], scale(state[1], -1)), S),
  scale(add(state[2], state[3]), S), scale(add(state[2], scale(state[3], -1)), S)];
}
// Logical order |a,b> = 00, 01, 10, 11. Eq. (7.87)'s one-photon phases
// are attached to the corresponding mode, independent of displayed basis order.
export function simulateGate({ input = 'plus0', delta = Math.PI, phiA = 17.5 * Math.PI / 180,
  phiB = 12.5 * Math.PI / 180, compensate = true, construction = 'cnot' } = {}) {
  finite(delta, phiA, phiB);
  if (!['cnot', 'phase'].includes(construction)) throw new RangeError('Unknown gate construction');
  const initial = inputState(input);
  const first = construction === 'cnot' ? hadamardTarget(initial) : clone(initial);
  const shifts = [0, phiB, phiA, phiA + phiB + delta];
  const cavity = first.map((z, i) => phase(z, shifts[i]));
  const corrected = cavity.map((z, i) => phase(z, compensate ? -([0, phiB, phiA, phiA + phiB][i]) : 0));
  const output = construction === 'cnot' ? hadamardTarget(corrected) : clone(corrected);
  const ideal = construction === 'cnot' ? [initial[0], initial[1], initial[3], initial[2]] : initial.map((z, i) => scale(z, i === 3 ? -1 : 1));
  return {
    initial, stages: [initial, first, cavity, corrected, output], output, ideal,
    probabilities: probabilities(output), fidelity: fidelity(output, ideal), concurrence: concurrence(output)
  };
}
