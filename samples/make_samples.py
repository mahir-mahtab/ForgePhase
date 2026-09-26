"""Generate one folder of sample inputs, and their results, for every operation.

Run from the repository root with the backend's Python::

    backend/.venv312/Scripts/python.exe samples/make_samples.py

Each ``samples/<operation>/`` folder holds that operation's inputs under their
own names and what the operation produces from them as ``result_*``. The
frontend serves this folder at ``/samples`` for its "Use sample" buttons.
Ciphers are encrypted with :data:`PASSPHRASE`, which ``README.md`` lists.
"""

import json
import pathlib
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from phaseforge.analysis import attacks  # noqa: E402
from phaseforge.api.support import json_safe  # noqa: E402
from phaseforge.audio import denoise, enhance  # noqa: E402
from phaseforge.audio import drpe as audio_drpe  # noqa: E402
from phaseforge.image import drpe as image_drpe  # noqa: E402
from phaseforge.image import freq_edit, hybrid, watermark  # noqa: E402
from phaseforge.io import audio_cipher, audio_io, image_cipher, image_io  # noqa: E402

SAMPLE_RATE = 16000
PASSPHRASE = "phaseforge-sample"


def test_image(size=128):
    """Gradient background with a disc and a bar -- structure that is obvious
    when recovered and obviously absent when it is not."""
    y, x = np.mgrid[0:size, 0:size] / size
    red = x
    green = y
    blue = 0.5 * np.ones_like(x)

    disc = (x - 0.35) ** 2 + (y - 0.35) ** 2 < 0.03
    red[disc], green[disc], blue[disc] = 1.0, 1.0, 0.2

    bar = (y > 0.7) & (y < 0.8) & (x > 0.2) & (x < 0.8)
    red[bar], green[bar], blue[bar] = 0.1, 0.1, 0.9

    return np.clip(np.stack([red, green, blue]), 0.0, 1.0)


def watermark_image(size=32):
    """A blocky 'PF' monogram."""
    mark = np.zeros((size, size))
    mark[6:26, 6:9] = 1.0        # P stem
    mark[6:9, 9:16] = 1.0        # P top
    mark[14:17, 9:16] = 1.0      # P bottom
    mark[6:16, 14:17] = 1.0      # P bowl
    mark[6:26, 20:23] = 1.0      # F stem
    mark[6:9, 23:29] = 1.0       # F top
    mark[14:17, 23:27] = 1.0     # F middle
    return mark


def face(expression, size=512, supersample=4):
    """A shaded cartoon face, ``"angry"`` or ``"happy"``.

    Both expressions share one head, so a pair is perfectly aligned -- the
    ideal input for a hybrid image, where misalignment is the usual failure.
    """
    big = size * supersample
    s = big / 512  # layout below is in 512-pixel units

    def box(x0, y0, x1, y1):
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    # Soft shading: a lit head against a darker backdrop, so the low band has
    # something to carry besides the features.
    y, x = np.mgrid[0:big, 0:big] / big
    backdrop = 0.35 + 0.25 * y
    head = ((x - 0.5) / 0.36) ** 2 + ((y - 0.52) / 0.44) ** 2
    light = 0.85 - 0.35 * np.hypot(x - 0.42, y - 0.4)
    canvas = np.where(head < 1, light, backdrop)
    img = Image.fromarray(np.uint8(np.clip(canvas, 0, 1) * 255), mode="L")
    draw = ImageDraw.Draw(img)
    ink = 25
    width = int(10 * s)

    if expression == "happy":
        for cx in (190, 322):
            draw.ellipse(box(cx - 30, 190, cx + 30, 250), fill=250, outline=ink, width=width)
            draw.ellipse(box(cx - 16, 206, cx + 16, 238), fill=ink)
            draw.arc(box(cx - 42, 145, cx + 42, 195), 200, 340, fill=ink, width=width)
        draw.chord(box(150, 290, 362, 420), 0, 180, fill=ink)
        draw.chord(box(185, 300, 327, 370), 0, 180, fill=235)
    elif expression == "angry":
        for cx, tilt in ((190, 1), (322, -1)):
            draw.ellipse(box(cx - 30, 205, cx + 30, 240), fill=250, outline=ink, width=width)
            draw.ellipse(box(cx - 12, 210, cx + 12, 234), fill=ink)
            inner, outer = (cx + 45 * tilt, 195), (cx - 45 * tilt, 160)
            draw.line([inner[0] * s, inner[1] * s, outer[0] * s, outer[1] * s],
                      fill=ink, width=int(18 * s))
        draw.arc(box(170, 360, 342, 470), 200, 340, fill=ink, width=int(14 * s))
        for cx in (160, 352):  # creases beside the nose
            draw.arc(box(cx - 25, 280, cx + 25, 350), 60, 120, fill=ink, width=width // 2)
    else:
        raise ValueError(f"unknown expression {expression!r}")

    draw.line(box(256, 250, 256, 320), fill=ink, width=width)  # nose
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    return (np.asarray(img, dtype=np.float64) / 255.0)[None, :, :]


def noisy_speech(duration=2.0, noise_level=0.06):
    """A voiced-sounding tone stack with a noise-only lead-in.

    The lead-in seeds the noise tracker; after that the noise is followed
    through the recording, so real recordings do not strictly need one.
    """
    rng = np.random.default_rng(0)
    lead = np.zeros(SAMPLE_RATE // 2)

    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    voice = sum(0.35 / (i + 1) * np.sin(2 * np.pi * 180 * (i + 1) * t) for i in range(5))
    tremolo = 0.7 + 0.3 * np.sin(2 * np.pi * 4 * t)
    voice = voice * tremolo

    clean = np.concatenate([lead, voice])
    noisy = clean + rng.normal(scale=noise_level, size=len(clean))
    return clean, noisy


def _folder(name):
    folder = HERE / name
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir()
    return folder


def _write_json(path, data):
    path.write_text(json.dumps(json_safe(data), indent=2) + "\n", encoding="utf-8")


def _image_samples(picture, mark, angry, happy):
    folder = _folder("image-encrypt")
    image_io.save_image(folder / "image.png", picture)
    ciphertext, metadata = image_drpe.encrypt(picture, PASSPHRASE)
    metadata["mode"] = "RGB"
    cipher_png = image_cipher.encode(ciphertext, metadata)
    (folder / "result_cipher.png").write_bytes(cipher_png)

    folder = _folder("image-decrypt")
    (folder / "cipher.png").write_bytes(cipher_png)
    ciphertext, metadata = image_cipher.decode(cipher_png)
    restored = image_drpe.decrypt(ciphertext, PASSPHRASE, metadata)
    image_io.save_image(folder / "result_restored.png", restored, metadata["mode"])

    folder = _folder("image-analysis")
    (folder / "cipher.png").write_bytes(cipher_png)
    image_io.save_image(folder / "original.png", picture)
    _write_json(folder / "result_report.json",
                attacks.robustness_report(picture, ciphertext, PASSPHRASE, metadata))

    folder = _folder("watermark-embed")
    image_io.save_image(folder / "image.png", picture)
    image_io.save_image(folder / "watermark.png", mark[None, :, :])
    marked = watermark.embed(picture, mark)
    image_io.save_image(folder / "result_watermarked.png", marked)

    folder = _folder("watermark-extract")
    image_io.save_image(folder / "original.png", picture)
    image_io.save_image(folder / "watermarked.png", marked)
    # Round-trip through 8-bit PNG, as a user's file would be.
    marked, _ = image_io.load_image(folder / "watermarked.png")
    recovered = watermark.extract(picture, marked, mark.shape)
    image_io.save_image(folder / "result_extracted.png", image_io.normalize(recovered))

    folder = _folder("filter")
    image_io.save_image(folder / "image.png", angry)
    image_io.save_image(folder / "result_low_pass.png",
                        freq_edit.apply_filter(angry, "low", 0.04))
    image_io.save_image(folder / "result_high_pass.png",
                        freq_edit.apply_filter(angry, "high", 0.04) + 0.5)

    folder = _folder("hybrid")
    image_io.save_image(folder / "near.png", angry)
    image_io.save_image(folder / "far.png", happy)
    blended = hybrid.hybrid(angry, happy)
    image_io.save_image(folder / "result_hybrid.png", blended)
    image_io.save_image(folder / "result_distance.png", hybrid.distance_preview(blended))


def _audio_samples(clean, noisy):
    folder = _folder("audio-encrypt")
    audio_io.save_audio(folder / "speech.wav", clean, SAMPLE_RATE)
    ciphertext, metadata = audio_drpe.encrypt(clean, PASSPHRASE, SAMPLE_RATE)
    cipher_wav = audio_cipher.encode(ciphertext, metadata)
    (folder / "result_cipher.wav").write_bytes(cipher_wav)

    folder = _folder("audio-decrypt")
    (folder / "cipher.wav").write_bytes(cipher_wav)
    ciphertext, metadata = audio_cipher.decode(cipher_wav)
    restored = audio_drpe.decrypt(ciphertext, PASSPHRASE, metadata)
    audio_io.save_audio(folder / "result_restored.wav", restored, metadata["sample_rate"])

    folder = _folder("audio-analysis")
    (folder / "cipher.wav").write_bytes(cipher_wav)
    audio_io.save_audio(folder / "original.wav", clean, SAMPLE_RATE)
    _write_json(folder / "result_report.json",
                attacks.robustness_report(clean, ciphertext, PASSPHRASE, metadata))

    folder = _folder("denoise")
    audio_io.save_audio(folder / "noisy.wav", noisy, SAMPLE_RATE)
    audio_io.save_audio(folder / "result_denoised.wav",
                        denoise.denoise_multichannel(noisy), SAMPLE_RATE)

    folder = _folder("enhance")
    audio_io.save_audio(folder / "noisy.wav", noisy, SAMPLE_RATE)
    audio_io.save_audio(folder / "result_enhanced.wav",
                        enhance.enhance_multichannel(noisy, SAMPLE_RATE), SAMPLE_RATE)


def main():
    _image_samples(test_image(), watermark_image(), face("angry"), face("happy"))
    clean, noisy = noisy_speech()
    _audio_samples(clean[None, :], noisy[None, :])

    for folder in sorted(path for path in HERE.iterdir() if path.is_dir()):
        names = ", ".join(sorted(path.name for path in folder.iterdir()))
        print(f"samples/{folder.name}: {names}")


if __name__ == "__main__":
    main()
