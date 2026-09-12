"""Command-line interface.

Exposes every module so the backend can be demonstrated and tested before any
frontend exists. Run ``python -m phaseforge --help`` for the full list.
"""

import argparse
import getpass
import json
import math
import sys

import numpy as np

from .analysis import attacks, metrics
from .audio import denoise as audio_denoise
from .audio import drpe as audio_drpe
from .audio import enhance as audio_enhance
from .core import transform
from .image import drpe as image_drpe
from .image import freq_edit, watermark
from .io import audio_io, container, image_cipher, image_io


def _passphrase(args):
    """Prefer an interactive prompt: a passphrase in argv lands in shell history."""
    return args.passphrase or getpass.getpass("Passphrase: ")


def _json_safe(value):
    """Replace infinities and NaN, which are not valid JSON, with strings."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    return value


def cmd_image_encrypt(args):
    image, mode = image_io.load_image(args.input, greyscale=args.greyscale)
    ciphertext, metadata = image_drpe.encrypt(image, _passphrase(args))
    metadata["mode"] = mode
    real_png, imaginary_png = image_cipher.encode_pair(ciphertext, metadata)
    with open(args.real_output, "wb") as output:
        output.write(real_png)
    with open(args.imaginary_output, "wb") as output:
        output.write(imaginary_png)
    print(f"encrypted {args.input} -> {args.real_output}, {args.imaginary_output} "
          f"(ciphertext {ciphertext.shape})")


def cmd_image_decrypt(args):
    with open(args.real_input, "rb") as real_file, open(args.imaginary_input, "rb") as imaginary_file:
        ciphertext, metadata = image_cipher.decode_pair(real_file.read(), imaginary_file.read())
    image = image_drpe.decrypt(ciphertext, _passphrase(args), metadata)
    image_io.save_image(args.output, image, metadata.get("mode"))
    print(f"decrypted {args.real_input}, {args.imaginary_input} -> {args.output}")


def cmd_audio_encrypt(args):
    signal, sample_rate = audio_io.load_audio(args.input)
    ciphertext, metadata = audio_drpe.encrypt(signal, _passphrase(args), sample_rate,
                                              block_size=args.block_size)
    container.save_container(args.output, ciphertext, metadata)
    print(f"encrypted {args.input} -> {args.output} (ciphertext {ciphertext.shape})")


def cmd_audio_decrypt(args):
    ciphertext, metadata = container.load_container(args.input)
    signal = audio_drpe.decrypt(ciphertext, _passphrase(args), metadata)
    audio_io.save_audio(args.output, signal, metadata["sample_rate"])
    print(f"decrypted {args.input} -> {args.output}")


def cmd_watermark_embed(args):
    image, mode = image_io.load_image(args.input)
    mark, _ = image_io.load_image(args.watermark, greyscale=True)
    marked = watermark.embed(image, mark[0], args.strength, args.position)
    image_io.save_image(args.output, marked, mode)
    print(f"watermarked {args.input} -> {args.output} (strength {args.strength})")


def cmd_watermark_extract(args):
    original, _ = image_io.load_image(args.original)
    marked, _ = image_io.load_image(args.marked)
    shape = (args.height, args.width)
    recovered = watermark.extract(original, marked, shape, args.strength, args.position)
    image_io.save_image(args.output, image_io.normalize(recovered))
    print(f"extracted watermark -> {args.output}")


def cmd_filter(args):
    image, mode = image_io.load_image(args.input)
    filtered = freq_edit.apply_filter(image, args.kind, args.cutoff, args.high_cutoff,
                                      args.filter_shape, args.order)
    image_io.save_image(args.output, filtered, mode)
    print(f"{args.kind}-pass ({args.filter_shape}, cutoff {args.cutoff}) -> {args.output}")


def cmd_spectrum(args):
    if args.imaginary:
        with open(args.input, "rb") as real_file, open(args.imaginary, "rb") as imaginary_file:
            data, _ = image_cipher.decode_pair(real_file.read(), imaginary_file.read())
    else:
        data, _ = image_io.load_image(args.input)
    image_io.save_image(args.output, freq_edit.spectrum_preview(data, args.gamma))
    print(f"spectrum preview -> {args.output}")


def cmd_denoise(args):
    signal, sample_rate = audio_io.load_audio(args.input)
    cleaned = audio_denoise.denoise_multichannel(
        signal, over_subtraction=args.over_subtraction, floor=args.floor)
    audio_io.save_audio(args.output, cleaned, sample_rate)
    print(f"denoised {args.input} -> {args.output}")


def cmd_enhance(args):
    signal, sample_rate = audio_io.load_audio(args.input)
    enhanced = audio_enhance.enhance_multichannel(
        signal, sample_rate, boost=args.boost, gate_threshold=args.gate_threshold)
    audio_io.save_audio(args.output, enhanced, sample_rate)
    print(f"enhanced {args.input} -> {args.output}")


def cmd_attack_report(args):
    if args.imaginary:
        with open(args.ciphertext, "rb") as real_file, open(args.imaginary, "rb") as imaginary_file:
            ciphertext, metadata = image_cipher.decode_pair(real_file.read(), imaginary_file.read())
    else:
        ciphertext, metadata = container.load_container(args.ciphertext)
    if metadata.get("kind") == "audio":
        original, _ = audio_io.load_audio(args.original)
    else:
        original, _ = image_io.load_image(args.original)
    report = attacks.robustness_report(original, ciphertext, _passphrase(args), metadata)
    print(json.dumps(_json_safe(report), indent=2, allow_nan=False))


def cmd_kpa_demo(args):
    """Recover a plaintext with no passphrase, given a reused key."""
    shape = (args.size, args.size)
    oracle = attacks.build_oracle("a passphrase the attacker never learns")

    rng = np.random.default_rng(0)
    secret = rng.random(shape)
    ciphertext = oracle(secret)

    crack = attacks.chosen_plaintext_attack(oracle, shape)
    recovered = crack(ciphertext)

    print("Chosen-plaintext attack against a reused DRPE key:")
    print(f"  probes used         : 2")
    print(f"  correlation         : {metrics.normalized_correlation(secret, recovered):.6f}")
    print(f"  max absolute error  : {np.max(np.abs(recovered - secret)):.2e}")
    print("  the passphrase was never guessed; linearity alone gave up the keys.")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="phaseforge", description="Fourier-domain image and audio security toolkit")
    parser.add_argument("--backend", choices=transform.available_backends(),
                        default=transform.get_backend(),
                        help="DFT implementation to use")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add(name, handler, help_text):
        sub = subparsers.add_parser(name, help=help_text)
        sub.set_defaults(handler=handler)
        return sub

    def add_passphrase(sub):
        sub.add_argument("--passphrase", help="prompted for securely if omitted")
        return sub

    sub = add("image-encrypt", cmd_image_encrypt, "encrypt an image with DRPE")
    sub.add_argument("input")
    sub.add_argument("real_output")
    sub.add_argument("imaginary_output")
    sub.add_argument("--greyscale", action="store_true")
    add_passphrase(sub)

    sub = add("image-decrypt", cmd_image_decrypt, "decrypt a DRPE image cipher pair")
    sub.add_argument("real_input")
    sub.add_argument("imaginary_input")
    sub.add_argument("output")
    add_passphrase(sub)

    sub = add("audio-encrypt", cmd_audio_encrypt, "encrypt audio with block-based DRPE")
    sub.add_argument("input")
    sub.add_argument("output")
    sub.add_argument("--block-size", type=int, default=audio_drpe.DEFAULT_BLOCK_SIZE)
    add_passphrase(sub)

    sub = add("audio-decrypt", cmd_audio_decrypt, "decrypt a DRPE audio container")
    sub.add_argument("input")
    sub.add_argument("output")
    add_passphrase(sub)

    sub = add("watermark-embed", cmd_watermark_embed, "embed a watermark in the spectrum")
    sub.add_argument("input")
    sub.add_argument("watermark")
    sub.add_argument("output")
    sub.add_argument("--strength", type=float, default=0.15)
    sub.add_argument("--position", type=float, default=0.25)

    sub = add("watermark-extract", cmd_watermark_extract, "recover an embedded watermark")
    sub.add_argument("original")
    sub.add_argument("marked")
    sub.add_argument("output")
    sub.add_argument("--height", type=int, required=True)
    sub.add_argument("--width", type=int, required=True)
    sub.add_argument("--strength", type=float, default=0.15)
    sub.add_argument("--position", type=float, default=0.25)

    sub = add("filter", cmd_filter, "low/high/band-pass an image in the frequency domain")
    sub.add_argument("input")
    sub.add_argument("output")
    sub.add_argument("--kind", choices=["low", "high", "band"], default="low")
    sub.add_argument("--cutoff", type=float, default=0.3)
    sub.add_argument("--high-cutoff", type=float, default=None)
    sub.add_argument("--filter-shape", choices=freq_edit.FILTER_SHAPES, default="gaussian")
    sub.add_argument("--order", type=int, default=2)

    sub = add("spectrum", cmd_spectrum, "render a magnitude spectrum as a viewable image")
    sub.add_argument("input", help="an image or the real cipher PNG")
    sub.add_argument("output")
    sub.add_argument("--imaginary", help="imaginary cipher PNG when input is encrypted")
    sub.add_argument("--gamma", type=float, default=1.0)

    sub = add("denoise", cmd_denoise, "reduce noise by spectral subtraction")
    sub.add_argument("input")
    sub.add_argument("output")
    sub.add_argument("--over-subtraction", type=float, default=2.0)
    sub.add_argument("--floor", type=float, default=0.05)

    sub = add("enhance", cmd_enhance, "enhance speech clarity")
    sub.add_argument("input")
    sub.add_argument("output")
    sub.add_argument("--boost", type=float, default=2.0)
    sub.add_argument("--gate-threshold", type=float, default=1.5)

    sub = add("attack-report", cmd_attack_report, "measure ciphertext robustness")
    sub.add_argument("ciphertext", help="an audio .npz container or image real PNG")
    sub.add_argument("original", help="the matching plaintext file, for comparison")
    sub.add_argument("--imaginary", help="imaginary image cipher PNG")
    add_passphrase(sub)

    sub = add("kpa-demo", cmd_kpa_demo, "demonstrate the chosen-plaintext break")
    sub.add_argument("--size", type=int, default=64)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    transform.set_backend(args.backend)
    args.handler(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
