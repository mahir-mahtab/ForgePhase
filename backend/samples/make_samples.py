"""Generate the sample files used for manual CLI demos.

Run once: ``python samples/make_samples.py``
"""

import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from phaseforge.io import audio_io, image_io  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
SAMPLE_RATE = 16000


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


def noisy_speech(duration=2.0, noise_level=0.06):
    """A voiced-sounding tone stack with a noise-only lead-in.

    The lead-in matters: the denoiser estimates its noise profile from the
    opening frames, so a real recording needs the same quiet head start.
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


def main():
    image_io.save_image(HERE / "test.png", test_image())
    image_io.save_image(HERE / "watermark.png", watermark_image()[None, :, :])

    clean, noisy = noisy_speech()
    audio_io.save_audio(HERE / "speech_clean.wav", clean[None, :], SAMPLE_RATE)
    audio_io.save_audio(HERE / "speech_noisy.wav", noisy[None, :], SAMPLE_RATE)

    for name in ("test.png", "watermark.png", "speech_clean.wav", "speech_noisy.wav"):
        print(f"wrote samples/{name}")


if __name__ == "__main__":
    main()
