"""The single transform seam for the whole project.

Every module calls these functions instead of ``numpy.fft`` directly, so the
underlying implementation can be swapped -- via :func:`set_backend` or
:func:`using_backend` -- without touching any calling code.

Normalization contract, binding on all backends:
    forward  X[k] = sum_n x[n] * exp(-2j*pi*k*n/N)          (unnormalized)
    inverse  x[n] = (1/N) * sum_k X[k] * exp(+2j*pi*k*n/N)  (scaled by 1/N)

``fftshift``/``ifftshift`` are pure index rotation, so they are implemented once
here and shared by every backend rather than reimplemented per backend.
"""

from contextlib import contextmanager

import numpy as np

from .backends import custom_backend, numpy_backend

_BACKENDS = {
    numpy_backend.NAME: numpy_backend,
    custom_backend.NAME: custom_backend,
}

_DEFAULT_BACKEND = numpy_backend.NAME
_active = _DEFAULT_BACKEND


def available_backends():
    return tuple(_BACKENDS)


def register_backend(name, module):
    """Add a backend exposing ``fft``, ``ifft``, ``fft2`` and ``ifft2``."""
    missing = [f for f in ("fft", "ifft", "fft2", "ifft2") if not callable(getattr(module, f, None))]
    if missing:
        raise ValueError(f"backend {name!r} is missing: {missing}")
    _BACKENDS[name] = module


def get_backend():
    return _active


def set_backend(name):
    global _active
    if name not in _BACKENDS:
        raise ValueError(f"unknown backend {name!r}; available: {available_backends()}")
    _active = name


@contextmanager
def using_backend(name):
    previous = get_backend()
    set_backend(name)
    try:
        yield
    finally:
        set_backend(previous)


def _impl():
    return _BACKENDS[_active]


def fft(x, axis=-1):
    return _impl().fft(np.asarray(x), axis=axis)


def ifft(x, axis=-1):
    return _impl().ifft(np.asarray(x), axis=axis)


def fft2(x):
    return _impl().fft2(np.asarray(x))


def ifft2(x):
    return _impl().ifft2(np.asarray(x))


def fftshift(x, axes=None):
    """Move the zero-frequency component to the centre of the spectrum."""
    x = np.asarray(x)
    if axes is None:
        axes = range(x.ndim)
    elif isinstance(axes, int):
        axes = (axes,)
    shift = [x.shape[ax] // 2 for ax in axes]
    return np.roll(x, shift, axis=tuple(axes))


def ifftshift(x, axes=None):
    """Inverse of :func:`fftshift`."""
    x = np.asarray(x)
    if axes is None:
        axes = range(x.ndim)
    elif isinstance(axes, int):
        axes = (axes,)
    shift = [-(x.shape[ax] // 2) for ax in axes]
    return np.roll(x, shift, axis=tuple(axes))


def fftfreq(n, d=1.0):
    """Frequency bin centres for an ``n``-point transform, in cycles per unit."""
    k = np.arange(n)
    # For even n the Nyquist bin counts as negative, matching the standard
    # convention; (n + 1) // 2 gets both parities right.
    k = np.where(k >= (n + 1) // 2, k - n, k)
    return k / (n * d)
