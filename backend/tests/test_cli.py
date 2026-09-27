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
    mark = np.zeros((16, 16))  # a quarter of the 64 x 64 image: no resizing
    mark[4:12, 4:12] = 1.0
    mark_file = tmp_path / "mark.png"
    image_io.save_image(mark_file, mark[None, :, :])

    marked = tmp_path / "marked.png"
    extracted = tmp_path / "extracted.png"
    run("watermark-embed", image_file, mark_file, marked)
    run("watermark-extract", image_file, marked, extracted)

    recovered, _ = image_io.load_image(extracted, greyscale=True)
    assert metrics.normalized_correlation(mark, recovered[0]) > 0.9


def test_audio_watermark_embed_and_extract(tmp_path, audio_file):
    t = np.arange(1500) / 16000
    clip = (0.6 * np.sin(2 * np.pi * 500 * t))[None, :]
    clip_file = tmp_path / "clip.wav"
    audio_io.save_audio(clip_file, clip, 16000)

    marked = tmp_path / "marked.wav"
    extracted = tmp_path / "extracted.wav"
    run("audio-watermark-embed", audio_file, clip_file, marked)
    run("audio-watermark-extract", audio_file, marked, extracted)

    recovered, _ = audio_io.load_audio(extracted)
    n = min(recovered.shape[-1], clip.shape[-1])
    assert metrics.normalized_correlation(clip[0, :n], recovered[0, :n]) > 0.99


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


def test_key_reuse_demo(capsys):
    run("key-reuse-demo", "--size", 32)
    assert "Chosen-plaintext attack" in capsys.readouterr().out


def test_cli_image_encrypt_decrypt_with_key_image(tmp_path, image_file):
    key_file = tmp_path / "key.png"
    image_io.save_image(key_file, np.random.default_rng(1).random((1, 16, 16)))
    cipher = tmp_path / "cipher.png"
    restored = tmp_path / "restored.png"

    run("image-encrypt", image_file, cipher, "--key-image", key_file)
    run("image-decrypt", cipher, restored, "--key-image", key_file)

    original, _ = image_io.load_image(image_file)
    recovered, _ = image_io.load_image(restored)
    assert metrics.psnr(original, recovered) > 40


def test_cli_audio_encrypt_decrypt_with_key_audio(tmp_path, audio_file):
    key_file = tmp_path / "key.wav"
    t = np.linspace(0, 0.2, 3200, endpoint=False)
    audio_io.save_audio(key_file, (0.5 * np.sin(2 * np.pi * 440 * t))[None, :], 16000)
    cipher = tmp_path / "cipher.wav"
    restored = tmp_path / "restored.wav"

    run("audio-encrypt", audio_file, cipher, "--key-audio", key_file)
    run("audio-decrypt", cipher, restored, "--key-audio", key_file)

    original, sr1 = audio_io.load_audio(audio_file)
    recovered, sr2 = audio_io.load_audio(restored)
    assert recovered.shape == original.shape
    assert metrics.snr(original, recovered) > 30



def test_cli_rejects_unsupported_key_image(tmp_path, image_file, capsys):
    from PIL import Image
    key_file = tmp_path / "key.webp"
    Image.fromarray(np.full((16, 16, 3), 128, np.uint8)).save(key_file)
    argv = ["image-encrypt", image_file, tmp_path / "cipher.png", "--key-image", key_file]
    assert cli.main([str(a) for a in argv]) != 0
    assert "PNG, JPEG, BMP or TIFF" in capsys.readouterr().err


def test_old_key_reuse_demo_name_still_works(capsys):
    run("kpa-demo", "--size", 32)
    assert "Chosen-plaintext attack" in capsys.readouterr().out
