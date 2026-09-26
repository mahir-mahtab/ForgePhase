"""Frequency-domain image filtering."""

import numpy as np
import pytest

from phaseforge.image import freq_edit


@pytest.fixture
def stripes():
    """Smooth ramp plus a high-frequency stripe pattern, so the two bands separate."""
    rows = np.linspace(0, 1, 64)
    low = np.repeat(rows[:, None], 64, axis=1)
    high = 0.1 * np.sin(np.arange(64) * np.pi / 2)[None, :]
    return (low + high)[None, :, :]


def test_low_pass_removes_the_stripes(stripes):
    filtered = freq_edit.apply_filter(stripes, "low", cutoff=0.1, filter_shape="ideal")
    residual = filtered - filtered.mean(axis=-1, keepdims=True)
    assert np.abs(residual).max() < np.abs(stripes - stripes.mean(axis=-1, keepdims=True)).max()


def test_high_pass_removes_the_ramp(stripes):
    filtered = freq_edit.apply_filter(stripes, "high", cutoff=0.1, filter_shape="ideal")
    assert abs(filtered.mean()) < 1e-6


def test_low_and_high_pass_sum_to_the_original(stripes):
    low = freq_edit.apply_filter(stripes, "low", cutoff=0.25, filter_shape="ideal")
    high = freq_edit.apply_filter(stripes, "high", cutoff=0.25, filter_shape="ideal")
    assert np.allclose(low + high, stripes)


def test_output_is_real(stripes):
    filtered = freq_edit.apply_filter(stripes, "low", cutoff=0.3)
    assert np.isrealobj(filtered)


@pytest.mark.parametrize("shape", freq_edit.FILTER_SHAPES)
def test_all_filter_shapes_run(stripes, shape):
    filtered = freq_edit.apply_filter(stripes, "low", cutoff=0.3, filter_shape=shape)
    assert filtered.shape == stripes.shape


def test_band_pass_needs_ordered_cutoffs(stripes):
    with pytest.raises(ValueError, match="high_cutoff"):
        freq_edit.apply_filter(stripes, "band", cutoff=0.4, high_cutoff=0.2)


def test_band_pass_sits_between_the_two(stripes):
    band = freq_edit.build_mask(stripes.shape, "band", cutoff=0.2, high_cutoff=0.5,
                                filter_shape="ideal")
    assert band.max() == 1.0
    assert band[32, 32] == 0.0  # DC is excluded


def test_unknown_kind_rejected(stripes):
    with pytest.raises(ValueError, match="kind must be"):
        freq_edit.apply_filter(stripes, "sideways")


def test_unknown_filter_shape_rejected(stripes):
    with pytest.raises(ValueError, match="filter_shape must be"):
        freq_edit.apply_filter(stripes, "low", filter_shape="triangular")

