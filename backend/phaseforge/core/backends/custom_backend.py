"""Hand-written DFT/FFT backend.

Currently unimplemented. Filling in the four functions below is the only change
required to run the entire project on a self-written transform -- no module
outside this file references an FFT implementation directly.

Contract every function must satisfy (see ``core.transform`` for the authority):

- ``fft(x, axis)``   forward, UNNORMALIZED:  X[k] = sum_n x[n] * exp(-2j*pi*k*n/N)
- ``ifft(x, axis)``  inverse, scaled by 1/N: x[n] = (1/N) * sum_k X[k] * exp(+2j*pi*k*n/N)
- ``fft2(x)`` / ``ifft2(x)`` operate on the last two axes. The 2D DFT is
  separable, so these may be implemented as ``fft`` along axis -1 followed by
  ``fft`` along axis -2.

Inputs may be real or complex; outputs are always complex. Inputs may carry
leading batch axes (e.g. shape ``(channels, height, width)``), so implementations
must operate along the named axis rather than assuming a 1D array.

Lengths are guaranteed to be powers of two -- ``core.padding`` enforces this
project-wide precisely so a radix-2 Cooley-Tukey implementation is sufficient
and neither mixed-radix nor Bluestein is needed.

``tests/test_transform.py`` is parametrized over every registered backend, so
these functions are validated against the NumPy reference as soon as they exist.
"""

NAME = "custom"


def _not_implemented(name):
    raise NotImplementedError(
        f"custom backend: {name}() is not implemented yet. "
        "See phaseforge/core/backends/custom_backend.py for the required contract."
    )


def fft(x, axis=-1):
    _not_implemented("fft")


def ifft(x, axis=-1):
    _not_implemented("ifft")


def fft2(x):
    _not_implemented("fft2")


def ifft2(x):
    _not_implemented("ifft2")
