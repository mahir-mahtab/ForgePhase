"""Frequency-domain watermarking, for images and audio."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.audio import watermark as audio_watermark
from phaseforge.image import watermark


@pytest.fixture
def image():
    rng = np.random.default_rng(0)
    base = rng.random((1, 128, 128)) * 0.2
    ramp = np.linspace(0, 0.6, 128)
    return np.clip(base + ramp[None, None, :], 0.0, 1.0)


@pytest.fixture
def mark():
    """Exactly the block size for a 128 x 128 image, so no resizing happens."""
    block = np.zeros((32, 32))
    block[8:24, 8:24] = 1.0
    block[0, :] = 0.5
    return block


def test_mark_is_a_quarter_of_the_image():
    assert watermark.mark_shape((3, 128, 128)) == (32, 32)
    assert watermark.mark_shape((1, 300, 400)) == (75, 100)


def test_watermarked_image_stays_real_and_close(image, mark):
    marked = watermark.embed(image, mark)
    assert marked.shape == image.shape
    assert np.isrealobj(marked)
    assert metrics.psnr(image, marked) > 30


def test_extraction_recovers_the_mark(image, mark):
    marked = watermark.embed(image, mark)
    recovered = watermark.extract(image, marked)
    assert recovered.shape == (1, 32, 32)
    assert np.max(np.abs(recovered[0] - mark)) < 1e-8


def test_any_size_mark_is_resized_to_fit(image):
    y, x = np.mgrid[0:90, 0:50] / 90
    mark = 0.5 + 0.5 * np.sin(6 * x) * np.cos(4 * y)  # smooth, so it survives resizing
    recovered = watermark.extract(image, watermark.embed(image, mark))
    assert recovered.shape == (1, 32, 32)
    expected = watermark._fit_mark(mark, image.shape)[0]
    assert metrics.normalized_correlation(expected, recovered[0]) > 0.999


def test_grey_mark_on_colour_image_comes_back_grey(mark):
    image = np.random.default_rng(1).random((3, 128, 128)) * 0.5
    recovered = watermark.extract(image, watermark.embed(image, mark))
    for plane in recovered:
        assert metrics.normalized_correlation(mark, plane) > 0.999


def test_colour_mark_keeps_each_channel(mark):
    image = np.random.default_rng(1).random((3, 128, 128)) * 0.5
    planes = np.stack([mark, 1.0 - mark, mark.T])
    recovered = watermark.extract(image, watermark.embed(image, planes))
    for expected, got in zip(planes, recovered):
        assert metrics.normalized_correlation(expected, got) > 0.999


def test_colour_mark_on_grey_image_is_averaged(image, mark):
    planes = np.stack([mark, mark, mark])
    recovered = watermark.extract(image, watermark.embed(image, planes))
    assert metrics.normalized_correlation(mark, recovered[0]) > 0.999


def test_unmarked_image_yields_no_watermark(image):
    recovered = watermark.extract(image, image)
    assert np.allclose(recovered, 0.0)


def test_survives_mild_noise(image, mark):
    rng = np.random.default_rng(2)
    attacked = watermark.embed(image, mark) + rng.normal(scale=0.005, size=image.shape)
    recovered = watermark.extract(image, attacked)
    assert metrics.normalized_correlation(mark, recovered[0]) > 0.5


def test_tiny_image_rejected():
    with pytest.raises(ValueError, match="too small"):
        watermark.embed(np.ones((1, 2, 2)), np.ones((4, 4)))


def test_mismatched_images_rejected(image):
    with pytest.raises(ValueError, match="differ in size"):
        watermark.extract(image, image[:, :64, :64])


@pytest.mark.parametrize("size", [128, 512, 1000])
def test_mark_survives_8bit_png_at_real_image_sizes(size):
    """The mark must outlive the rounding of the PNG the API returns."""
    rng = np.random.default_rng(size)
    # Smooth, like a photo or screenshot: little energy outside low frequencies.
    y, x = np.mgrid[0:size, 0:size] / size
    base = 0.5 + 0.3 * np.sin(9 * x) * np.cos(7 * y) + rng.normal(0, 0.02, (size, size))
    image = np.round(np.clip(np.stack([base, 0.9 * base, 0.8 * base]), 0, 1) * 255) / 255
    block = rng.random(watermark.mark_shape(image.shape))
    marked = watermark.embed(image, block)
    saved = np.round(np.clip(marked, 0.0, 1.0) * 255) / 255
    recovered = watermark.extract(image, saved)
    for plane in recovered:
        assert metrics.normalized_correlation(block, plane) > 0.95
    assert metrics.psnr(image, saved) > 35


# -- Audio ---------------------------------------------------------------------

SAMPLE_RATE = 16000


@pytest.fixture
def host():
    t = np.arange(SAMPLE_RATE * 2) / SAMPLE_RATE
    return (0.4 * np.sin(2 * np.pi * 220 * t) * (1 + 0.3 * np.sin(5 * t)))[None, :]


@pytest.fixture
def clip():
    t = np.arange(SAMPLE_RATE // 4) / SAMPLE_RATE
    return (0.5 * np.sin(2 * np.pi * 660 * t) * np.exp(-3 * t))[None, :]


def _pcm16(signal):
    return np.round(np.clip(signal, -1, 1) * 32767) / 32767


def test_audio_mark_is_quiet(host, clip):
    marked = audio_watermark.embed(host, SAMPLE_RATE, clip, SAMPLE_RATE)
    assert marked.shape == host.shape
    assert metrics.snr(host, marked) > 40


def test_audio_mark_round_trips_through_pcm16(host, clip):
    marked = audio_watermark.embed(host, SAMPLE_RATE, clip, SAMPLE_RATE)
    recovered = audio_watermark.extract(_pcm16(host), _pcm16(marked))
    n = min(recovered.shape[-1], clip.shape[-1])
    assert abs(recovered.shape[-1] - clip.shape[-1]) < SAMPLE_RATE // 20  # trimmed
    assert metrics.normalized_correlation(clip[0, :n], recovered[0, :n]) > 0.99


def test_audio_mark_is_resampled_to_the_host_rate(host):
    rate = 44100
    t = np.arange(rate // 4) / rate
    clip = np.sin(2 * np.pi * 330 * t)[None, :]
    recovered = audio_watermark.extract(host, audio_watermark.embed(host, SAMPLE_RATE, clip, rate))
    expected = np.sin(2 * np.pi * 330 * np.arange(SAMPLE_RATE // 4) / SAMPLE_RATE)
    n = min(recovered.shape[-1], expected.size)
    assert metrics.normalized_correlation(expected[:n], recovered[0, :n]) > 0.99


def test_audio_mark_longer_than_capacity_is_cut(host):
    clip = np.random.default_rng(0).uniform(-1, 1, (1, host.shape[-1]))
    recovered = audio_watermark.extract(host, audio_watermark.embed(host, SAMPLE_RATE, clip, SAMPLE_RATE))
    assert recovered.shape[-1] <= audio_watermark.capacity(host.shape[-1])


def test_stereo_host_carries_the_mark(host, clip):
    stereo = np.vstack([host, 0.5 * host])
    recovered = audio_watermark.extract(stereo, audio_watermark.embed(stereo, SAMPLE_RATE, clip, SAMPLE_RATE))
    n = min(recovered.shape[-1], clip.shape[-1])
    assert metrics.normalized_correlation(clip[0, :n], recovered[0, :n]) > 0.99


def test_silent_audio_mark_rejected(host):
    with pytest.raises(ValueError, match="silent"):
        audio_watermark.embed(host, SAMPLE_RATE, np.zeros((1, 100)), SAMPLE_RATE)


def test_mismatched_recordings_rejected(host):
    with pytest.raises(ValueError, match="differ in shape"):
        audio_watermark.extract(host, host[:, :-10])
