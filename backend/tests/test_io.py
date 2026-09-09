"""Image and audio file handling."""

import numpy as np
import pytest

from phaseforge.io import audio_io, image_io


def test_greyscale_image_round_trip(tmp_path):
    rng = np.random.default_rng(0)
    original = rng.random((1, 32, 24))
    path = tmp_path / "grey.png"

    image_io.save_image(path, original)
    loaded, mode = image_io.load_image(path)

    assert mode == "L"
    assert loaded.shape == original.shape
    assert np.max(np.abs(loaded - original)) < 1.0 / 255  # 8-bit quantization only


def test_colour_image_round_trip(tmp_path):
    rng = np.random.default_rng(1)
    original = rng.random((3, 16, 20))
    path = tmp_path / "colour.png"

    image_io.save_image(path, original)
    loaded, mode = image_io.load_image(path)

    assert mode == "RGB"
    assert loaded.shape == original.shape
    assert np.max(np.abs(loaded - original)) < 1.0 / 255


def test_load_as_greyscale(tmp_path):
    path = tmp_path / "colour.png"
    image_io.save_image(path, np.ones((3, 8, 8)) * 0.5)
    loaded, mode = image_io.load_image(path, greyscale=True)
    assert mode == "L"
    assert loaded.shape == (1, 8, 8)


def test_save_accepts_bare_2d(tmp_path):
    path = tmp_path / "bare.png"
    image_io.save_image(path, np.ones((8, 8)) * 0.25)
    loaded, _ = image_io.load_image(path)
    assert loaded.shape == (1, 8, 8)


def test_out_of_range_values_are_clipped(tmp_path):
    path = tmp_path / "clip.png"
    image_io.save_image(path, np.array([[[-5.0, 0.5, 5.0]]]))
    loaded, _ = image_io.load_image(path)
    assert loaded[0, 0, 0] == 0.0
    assert loaded[0, 0, 2] == 1.0


def test_normalize_rescales_to_unit_range():
    normalized = image_io.normalize(np.array([-3.0, 0.0, 7.0]))
    assert normalized.min() == 0.0 and normalized.max() == 1.0


def test_normalize_handles_constant_input():
    assert np.all(image_io.normalize(np.full((4, 4), 2.5)) == 0.0)


def test_mono_audio_round_trip(tmp_path):
    t = np.linspace(0, 0.1, 1600, endpoint=False)
    original = (0.5 * np.sin(2 * np.pi * 440 * t))[None, :]
    path = tmp_path / "mono.wav"

    audio_io.save_audio(path, original, 16000)
    loaded, sample_rate = audio_io.load_audio(path)

    assert sample_rate == 16000
    assert loaded.shape == original.shape
    assert np.max(np.abs(loaded - original)) < 1e-3  # PCM_16 quantization


def test_stereo_audio_round_trip(tmp_path):
    rng = np.random.default_rng(2)
    original = rng.normal(scale=0.2, size=(2, 800))
    path = tmp_path / "stereo.wav"

    audio_io.save_audio(path, original, 8000)
    loaded, sample_rate = audio_io.load_audio(path)

    assert sample_rate == 8000
    assert loaded.shape == original.shape


def test_float_subtype_is_lossless(tmp_path):
    rng = np.random.default_rng(3)
    original = rng.normal(scale=0.2, size=(1, 512))
    path = tmp_path / "float.wav"

    audio_io.save_audio(path, original, 16000, subtype="FLOAT")
    loaded, _ = audio_io.load_audio(path)
    assert np.max(np.abs(loaded - original)) < 1e-7


def test_save_accepts_bare_1d_audio(tmp_path):
    path = tmp_path / "bare.wav"
    audio_io.save_audio(path, np.zeros(400), 8000)
    loaded, _ = audio_io.load_audio(path)
    assert loaded.shape == (1, 400)


def test_to_mono_averages_channels():
    stereo = np.array([[1.0, 0.0], [0.0, 1.0]])
    assert np.allclose(audio_io.to_mono(stereo), [0.5, 0.5])
