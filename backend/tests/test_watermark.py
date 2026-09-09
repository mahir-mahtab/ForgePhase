"""Frequency-domain watermarking."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.image import watermark


@pytest.fixture
def image():
    rng = np.random.default_rng(0)
    base = rng.random((1, 128, 128)) * 0.2
    ramp = np.linspace(0, 0.6, 128)
    return np.clip(base + ramp[None, None, :], 0.0, 1.0)


@pytest.fixture
def mark():
    block = np.zeros((16, 16))
    block[4:12, 4:12] = 1.0
    block[0, :] = 0.5
    return block


def test_watermarked_image_stays_real_and_close(image, mark):
    marked = watermark.embed(image, mark, strength=0.15)
    assert marked.shape == image.shape
    assert np.isrealobj(marked)
    assert metrics.psnr(image, marked) > 30


def test_extraction_recovers_the_mark(image, mark):
    marked = watermark.embed(image, mark, strength=0.15)
    recovered = watermark.extract(image, marked, mark.shape, strength=0.15)
    assert metrics.normalized_correlation(mark, recovered) > 0.99


def test_extraction_works_on_colour(mark):
    rng = np.random.default_rng(1)
    image = rng.random((3, 128, 128)) * 0.5
    marked = watermark.embed(image, mark, strength=0.2)
    recovered = watermark.extract(image, marked, mark.shape, strength=0.2)
    assert metrics.normalized_correlation(mark, recovered) > 0.99


def test_unmarked_image_yields_no_watermark(image, mark):
    recovered = watermark.extract(image, image, mark.shape, strength=0.15)
    assert abs(metrics.normalized_correlation(mark, recovered)) < 0.2


def test_stronger_embedding_is_more_visible(image, mark):
    subtle = watermark.embed(image, mark, strength=0.05)
    heavy = watermark.embed(image, mark, strength=0.5)
    assert metrics.psnr(image, subtle) > metrics.psnr(image, heavy)


def test_survives_mild_noise(image, mark):
    rng = np.random.default_rng(2)
    marked = watermark.embed(image, mark, strength=0.3)
    attacked = marked + rng.normal(scale=0.01, size=marked.shape)
    recovered = watermark.extract(image, attacked, mark.shape, strength=0.3)
    assert metrics.normalized_correlation(mark, recovered) > 0.5


def test_oversized_watermark_rejected(image):
    with pytest.raises(ValueError, match="too large"):
        watermark.embed(image, np.ones((100, 100)))


def test_position_outside_spectrum_rejected(image, mark):
    with pytest.raises(ValueError, match="outside the spectrum"):
        watermark.embed(image, mark, position=0.49)
