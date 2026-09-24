"""End-to-end CLI runs, exercising the paths a demo actually takes."""

import numpy as np
import pytest

from phaseforge import cli
from phaseforge.analysis import metrics
from phaseforge.io import audio_io, image_io

PASSPHRASE = "cli test passphrase"


@pytest.fixture
def image_file(tmp_path):
    y, x = np.mgrid[0:64, 0:64] / 64
    image = np.stack([x, y, np.full_like(x, 0.5)])
    image[:, 20:40, 20:40] = 1.0
    path = tmp_path / "input.png"
    image_io.save_image(path, image)
    return path


@pytest.fixture
def audio_file(tmp_path):
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    path = tmp_path / "input.wav"
    audio_io.save_audio(path, (0.4 * np.sin(2 * np.pi * 220 * t))[None, :], 16000,
                        subtype="FLOAT")
    return path


def run(*argv):
    assert cli.main([str(a) for a in argv]) == 0


def test_image_encrypt_decrypt_round_trip(tmp_path, image_file):
    cipher = tmp_path / "cipher.png"
    restored = tmp_path / "restored.png"

    run("image-encrypt", image_file, cipher, "--passphrase", PASSPHRASE)
    run("image-decrypt", cipher, restored, "--passphrase", PASSPHRASE)

    original, _ = image_io.load_image(image_file)
    recovered, _ = image_io.load_image(restored)
    assert metrics.psnr(original, recovered) > 40


def test_image_decrypt_with_wrong_passphrase_yields_noise(tmp_path, image_file):
    cipher = tmp_path / "cipher.png"
    wrong = tmp_path / "wrong.png"

    run("image-encrypt", image_file, cipher, "--passphrase", PASSPHRASE)
    run("image-decrypt", cipher, wrong, "--passphrase", "not the passphrase")

    original, _ = image_io.load_image(image_file)
    recovered, _ = image_io.load_image(wrong)
    assert abs(metrics.normalized_correlation(original, recovered)) < 0.1


def test_audio_encrypt_decrypt_round_trip(tmp_path, audio_file):
    cipher = tmp_path / "cipher.wav"
    restored = tmp_path / "restored.wav"

    run("audio-encrypt", audio_file, cipher, "--passphrase", PASSPHRASE)
    run("audio-decrypt", cipher, restored, "--passphrase", PASSPHRASE)

    original, _ = audio_io.load_audio(audio_file)
    recovered, _ = audio_io.load_audio(restored)
    assert recovered.shape == original.shape
    assert metrics.snr(original, recovered) > 30


def test_watermark_embed_and_extract(tmp_path, image_file):
    mark = np.zeros((16, 16))
    mark[4:12, 4:12] = 1.0
    mark_file = tmp_path / "mark.png"
    image_io.save_image(mark_file, mark[None, :, :])

    marked = tmp_path / "marked.png"
    extracted = tmp_path / "extracted.png"
    run("watermark-embed", image_file, mark_file, marked, "--strength", 0.3)
    run("watermark-extract", image_file, marked, extracted,
        "--height", 16, "--width", 16, "--strength", 0.3)

    recovered, _ = image_io.load_image(extracted, greyscale=True)
    assert metrics.normalized_correlation(mark, recovered[0]) > 0.9


@pytest.mark.parametrize("kind", ["low", "high"])
def test_filter_runs(tmp_path, image_file, kind):
    output = tmp_path / f"{kind}.png"
    run("filter", image_file, output, "--kind", kind, "--cutoff", 0.2)
    assert output.exists()


def test_band_pass_runs(tmp_path, image_file):
    output = tmp_path / "band.png"
    run("filter", image_file, output, "--kind", "band", "--cutoff", 0.1,
        "--high-cutoff", 0.4)
    assert output.exists()


def test_spectrum_of_image(tmp_path, image_file):
    output = tmp_path / "spectrum.png"
    run("spectrum", image_file, output)
    assert output.exists()


def test_spectrum_of_ciphertext_looks_like_noise(tmp_path, image_file):
    cipher = tmp_path / "cipher.png"
    preview = tmp_path / "preview.png"
    run("image-encrypt", image_file, cipher, "--passphrase", PASSPHRASE)
    run("spectrum", cipher, preview)

    original, _ = image_io.load_image(image_file)
    rendered, _ = image_io.load_image(preview)
    assert abs(metrics.normalized_correlation(original, rendered)) < 0.2


def test_denoise_and_enhance(tmp_path, audio_file):
    denoised = tmp_path / "denoised.wav"
    enhanced = tmp_path / "enhanced.wav"
    run("denoise", audio_file, denoised)
    run("enhance", denoised, enhanced)
    assert enhanced.exists()


def test_attack_report(tmp_path, image_file, capsys):
    cipher = tmp_path / "cipher.png"
    run("image-encrypt", image_file, cipher, "--passphrase", PASSPHRASE)
    capsys.readouterr()

    run("attack-report", cipher, image_file, "--passphrase", PASSPHRASE)
    assert "noise_5pct" in capsys.readouterr().out


def test_attack_report_on_audio(tmp_path, audio_file, capsys):
    cipher = tmp_path / "audio_cipher.wav"
    run("audio-encrypt", audio_file, cipher, "--passphrase", PASSPHRASE)
    capsys.readouterr()

    run("attack-report", cipher, audio_file, "--passphrase", PASSPHRASE)
    assert "snr_db" in capsys.readouterr().out


def test_kpa_demo(capsys):
    run("kpa-demo", "--size", 32)
    assert "Chosen-plaintext attack" in capsys.readouterr().out
