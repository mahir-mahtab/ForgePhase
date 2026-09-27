"""Statistical building blocks shared by the denoiser and the voice enhancer.

Everything here works on STFT frames from :mod:`..core.framing` and returns
per-bin quantities; nothing resynthesizes audio.

- :func:`track_noise_psd` follows the noise power spectral density through the
  whole recording with the speech-presence-probability estimator of Gerkmann &
  Hendriks (2012), so the noise may change over time and no noise-only lead-in
  is required -- the opening frames only seed the estimate.
- :func:`decision_directed_snr` is Ephraim & Malah's a priori SNR estimate,
  whose recursive smoothing is what keeps statistical suppressors free of the
  "musical noise" that plain spectral subtraction produces.
- :func:`lsa_gain` is the Ephraim & Malah (1985) log-spectral amplitude gain,
  and :func:`presence_probability` the speech-presence term Cohen's OM-LSA
  (2002) uses to blend it with a floor.
"""

import numpy as np

EPSILON = 1e-12

# Gerkmann & Hendriks' fixed priors: the SNR assumed when speech is present,
# 15 dB, and a 50 % prior probability of speech in any bin.
_SPP_XI_H1 = 10.0 ** (15.0 / 10.0)
_SPP_PRIOR_RATIO = 1.0  # P(H0) / P(H1)
_SPP_NOISE_SMOOTHING = 0.8
_SPP_STAGNATION_SMOOTHING = 0.9
_SPP_STAGNATION_LIMIT = 0.99


def check_noise_frames(noise_frames):
    if isinstance(noise_frames, bool) or not isinstance(noise_frames, (int, np.integer)):
        raise ValueError(f"noise_frames must be an integer, got {noise_frames!r}")
    if noise_frames < 1:
        raise ValueError(f"noise_frames must be at least 1, got {noise_frames}")


def initial_noise_psd(power, noise_frames):
    """Mean power of the opening frames: a seed, refined by the tracker."""
    check_noise_frames(noise_frames)
    usable = min(noise_frames, power.shape[0])
    return np.maximum(np.mean(power[:usable], axis=0), EPSILON)


def track_noise_psd(power, noise_frames=6, initial=None):
    """Noise PSD for every frame of ``power`` (``|STFT|**2``, frames x bins).

    Unbiased MMSE noise tracking driven by a soft speech presence probability
    (Gerkmann & Hendriks, IEEE TASLP 2012). Each frame, the posterior
    probability of speech is computed from the a posteriori SNR with fixed
    priors; the noise periodogram is then estimated as a blend of the current
    frame (where speech is likely absent) and the previous estimate (where it
    is likely present), and recursively smoothed.

    Bins stuck at a very high speech probability are capped, which lets the
    tracker climb out when the noise floor rises abruptly.
    """
    power = np.asarray(power, dtype=np.float64)
    noise = initial_noise_psd(power, noise_frames) if initial is None else \
        np.maximum(np.asarray(initial, dtype=np.float64), EPSILON)

    ratio = _SPP_XI_H1 / (1.0 + _SPP_XI_H1)
    smoothed_presence = np.zeros(power.shape[1])
    estimates = np.empty_like(power)

    for i, frame in enumerate(power):
        posterior = frame / noise
        exponent = np.minimum(posterior * ratio, 700.0)
        presence = 1.0 / (1.0 + _SPP_PRIOR_RATIO * (1.0 + _SPP_XI_H1) * np.exp(-exponent))

        smoothed_presence = (_SPP_STAGNATION_SMOOTHING * smoothed_presence
                             + (1.0 - _SPP_STAGNATION_SMOOTHING) * presence)
        stuck = smoothed_presence > _SPP_STAGNATION_LIMIT
        presence = np.where(stuck, np.minimum(presence, _SPP_STAGNATION_LIMIT), presence)

        periodogram = (1.0 - presence) * frame + presence * noise
        noise = _SPP_NOISE_SMOOTHING * noise + (1.0 - _SPP_NOISE_SMOOTHING) * periodogram
        noise = np.maximum(noise, EPSILON)
        estimates[i] = noise

    return estimates


def decision_directed_snr(power, noise, alpha=0.98, xi_min=10.0 ** (-25.0 / 10.0),
                          gain_rule=None):
    """A priori SNR for every frame by the decision-directed rule.

    ``xi = alpha * |S_prev|**2 / noise + (1 - alpha) * max(gamma - 1, 0)``,
    where ``S_prev`` is the previous frame's clean-speech estimate. That
    estimate needs a gain, so ``gain_rule(xi, gamma)`` is called frame by
    frame; it defaults to the Wiener gain. Returns ``(xi, gamma, gains)``.
    """
    gain_rule = wiener_gain if gain_rule is None else gain_rule
    gamma = power / np.maximum(noise, EPSILON)

    xi = np.empty_like(gamma)
    gains = np.empty_like(gamma)
    previous_clean = np.zeros(gamma.shape[1])
    for i in range(gamma.shape[0]):
        ml = np.maximum(gamma[i] - 1.0, 0.0)
        estimate = alpha * previous_clean / np.maximum(noise[i], EPSILON) + (1.0 - alpha) * ml
        xi[i] = np.maximum(estimate, xi_min)
        gains[i] = gain_rule(xi[i], gamma[i])
        previous_clean = gains[i] ** 2 * power[i]
    return xi, gamma, gains


def wiener_gain(xi, gamma=None):
    return xi / (1.0 + xi)


def exp1(x):
    """Exponential integral ``E1(x)`` for ``x > 0``, vectorized without SciPy.

    Power series below 1; above it, the Abramowitz & Stegun 5.1.56 rational
    approximation of ``x * exp(x) * E1(x)`` (relative error under 5e-5).
    """
    x = np.maximum(np.asarray(x, dtype=np.float64), 1e-300)
    result = np.empty_like(x)

    small = x < 1.0
    xs = x[small]
    term = np.ones_like(xs)
    series = np.zeros_like(xs)
    for k in range(1, 25):
        term = term * -xs / k
        series -= term / k
    result[small] = -np.euler_gamma - np.log(xs) + series

    xl = x[~small]
    numerator = xl * xl + 2.334733 * xl + 0.250621
    denominator = xl * xl + 3.330657 * xl + 1.681534
    result[~small] = numerator / (denominator * xl) * np.exp(-np.minimum(xl, 700.0))
    return result


def lsa_gain(xi, gamma):
    """Ephraim & Malah log-spectral amplitude (LSA) gain."""
    v = xi / (1.0 + xi) * gamma
    return xi / (1.0 + xi) * np.exp(0.5 * exp1(v))


def presence_probability(xi, gamma, absence_prior=0.5):
    """Conditional speech presence probability used by OM-LSA."""
    v = np.minimum(xi / (1.0 + xi) * gamma, 700.0)
    odds = absence_prior / (1.0 - absence_prior) * (1.0 + xi) * np.exp(-v)
    return 1.0 / (1.0 + odds)


def db_to_gain(db):
    return 10.0 ** (-abs(db) / 20.0)
