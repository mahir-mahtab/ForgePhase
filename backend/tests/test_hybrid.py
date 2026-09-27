"""Hybrid images: the near image's detail over the far image's broad shapes."""

import numpy as np
import pytest

from phaseforge.image import freq_edit, hybrid


@pytest.fixture
def pair():
    """A smooth ramp (far) and fine stripes (near), whose bands barely overlap."""
    y, x = np.mgrid[0:64, 0:64] / 64
    far = (0.2 + 0.6 * y)[None, :, :]
    near = (0.5 + 0.3 * np.sin(np.arange(64) * np.pi / 2))[None, None, :] * np.ones((1, 64, 1))
    return near, far


def _band_energy(image, lo, hi):
    spectrum = np.abs(np.fft.fftshift(np.fft.fft2(image - image.mean())))
    distance = freq_edit.radial_distance(image.shape)
    return spectrum[..., (distance >= lo) & (distance < hi)].sum()


def test_low_band_keeps_the_far_image_and_high_band_the_near_one(pair):
    near, far = pair
    low, high = hybrid.components(near, far)
    # The ramp survives the low-pass almost intact, away from the mirrored edges.
    assert np.abs(low - far)[:, 8:-8, 8:-8].max() < 0.05
    # The stripes survive the high-pass; the flat mean does not.
    assert abs(high.mean()) < 0.01  # was 0.5 before the high-pass
    assert np.allclose(high[:, 8:-8, 8:-8], (near - 0.5)[:, 8:-8, 8:-8], atol=0.02)


def test_hybrid_separates_the_bands(pair):
    near, far = pair
    result = hybrid.hybrid(near, far)
    assert _band_energy(result, 0, 0.05) > _band_energy(near, 0, 0.05)
    assert _band_energy(result, 0.5, 2) > 0.9 * _band_energy(near, 0.5, 2)
    assert result.min() >= 0 and result.max() <= 1


def test_no_seam_at_the_borders():
    """A vertical ramp wraps into a step under the FFT; mirroring must hide it."""
    ramp = np.linspace(0, 1, 64)[None, :, None] * np.ones((1, 1, 64))
    flat = np.full((1, 64, 64), 0.5)
    _, high = hybrid.components(ramp, flat)
    wrapped = freq_edit.apply_filter(ramp, "high", hybrid.DEFAULT_NEAR_CUTOFF)
    assert np.abs(high).max() < 0.1 * np.abs(wrapped).max()


def test_far_image_is_fitted_to_the_near_size():
    near = np.zeros((1, 40, 60))
    far = np.ones((3, 100, 50))
    result = hybrid.hybrid(near, far)
    assert result.shape == (3, 40, 60)


def test_fit_to_crops_rather_than_stretches():
    wide = np.zeros((1, 10, 30))
    wide[:, :, 10:20] = 1.0  # the centre third
    fitted = hybrid.fit_to(wide, 10, 10)
    assert fitted.shape == (1, 10, 10)
    assert fitted.mean() > 0.95


def test_distance_preview_shrinks_each_level():
    preview = hybrid.distance_preview(np.zeros((1, 64, 64)), levels=3, gap=4)
    assert preview.shape == (1, 64, 64 + 32 + 16 + 2 * 4)


@pytest.mark.parametrize("gain", [0, -1, 6, np.nan])
def test_rejects_bad_gain(pair, gain):
    with pytest.raises(ValueError):
        hybrid.hybrid(*pair, near_gain=gain)
