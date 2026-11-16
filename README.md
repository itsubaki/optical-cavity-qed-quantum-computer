# Optical cavity QED simulator for quantum computation

A demo built with HTML, CSS, and JavaScript that explores atom–photon exchange, atom-mediated Kerr nonlinearity, and optical quantum gates.
It uses the models described in Nielsen & Chuang, *Quantum Computation and Quantum Information*, §7.5.

## Experiments

- **Atom–photon exchange** simulates the Jaynes–Cummings propagator in Eq. (7.77), starting with at most one total excitation. Adjust the input, interaction time, detuning, and coupling to observe Rabi oscillations and atom–field entanglement. This experiment opens by default.
- **Atom-mediated Kerr** simulates two optical modes coupled to a three-level atom using Eqs. (7.81)–(7.86). It retains the full eight-state atom–field system, including atomic excitation. The “Fig. 7.5” preset restores t = 0.98 and gₐ = gᵦ = 1. The detuning plot covers −4 to 4, including the textbook figure’s range of −2 to 2.
- **Photon quantum gate** implements the independent ideal phase model of Eq. (7.87), with optional local phase compensation and target Hadamards to construct CZ or CNOT. Select an observation point to inspect complex amplitudes, measurement probabilities, state fidelity, and concurrence.

The single-photon absorption probability is

$$
P_{\mathrm{abs}} = \frac{g^2}{g^2+\delta^2}\sin^2(\Omega t),
\qquad \Omega = \sqrt{g^2+\delta^2}.
$$

The nonlinear phase is the difference between the joint and individual survival phases:

$$
\chi_3 \equiv \varphi_{ab}-\varphi_a-\varphi_b \pmod{2\pi}.
$$

The display uses the principal value of this phase difference.

After compensating the local phases, the ideal gate becomes

$$
U_{\mathrm{corrected}}(\Delta) = \mathrm{diag}(1,1,1,e^{i\Delta}),
\qquad U_{\mathrm{CNOT}} = (I\otimes H)U_{\mathrm{corrected}}(\pi)(I\otimes H).
$$

At Δ = π, the result matches the logical CNOT output. Input |+0⟩ produces the Bell state (|00⟩ + |11⟩)/√2.
The “16°” preset inserts the historical experiment’s phases, φₐ ≈ 17.5°, φᵦ ≈ 12.5°, and Δ ≈ 16°, into a lossless phase model.
The “Ideal π” preset assumes a 180° conditional phase; it does not imply that the three-level model realizes a deterministic CNOT.
See [Turchette et al. (1995)](https://arxiv.org/abs/quant-ph/9511008) for the experiment.

## Basis and phase conventions

All calculations use ℏ = 1.

- **Rabi:** Kets are |field,atom⟩, with atomic ground state 0 and excited state 1. The basis order is `00,01,10`. The rotating-frame evolution follows Eq. (7.77) directly, with generator `[[δ,0,0],[0,−δ,g],[0,g,δ]]`, rather than propagating the inconsistent signs printed in Eq. (7.76).
- **Kerr:** Kets are |a,b,atom⟩, in the order `000,100,001,010,002,110,011,102` used in Eq. (7.82). The atom starts in state 0. For the Hamiltonian blocks in Eqs. (7.83)–(7.85), this mode uses `U = exp(+iHt)`, as stated below Eq. (7.85), to match Eq. (7.86) and the phase sign in Fig. 7.5. Absorption means reversible atomic excitation in this closed system.
- **Ideal gate:** The logical basis is |a,b⟩ = `00,01,10,11`, with mode a controlling mode b. The values 0 and 1 represent polarization or dual-rail logical states. Local phases follow the named modes, giving `diag(1,e^{iφ_b},e^{iφ_a},e^{i(φ_a+φ_b+Δ)})`; the single-photon basis order differs from Eq. (7.87).

Kerr mode displays the full state without postselection. Phases are principal angles of survival amplitudes; a dash marks a vanishing amplitude, and curves break across phase branch cuts.
Fidelity measures agreement with the ideal final output for the selected input and observation point; it is not an average gate fidelity.
Cavity leakage κ, spontaneous emission γ, reflection losses, atomic motion, traveling pulses, detector imperfections, and physical state-preparation or measurement hardware are not modeled.
The Kerr and ideal gate experiments are separate models, rather than a simulation of a complete scalable quantum computer.
