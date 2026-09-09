"""PhaseForge -- a Fourier-domain image and audio security toolkit.

Every module in this package routes its transforms through
:mod:`phaseforge.core.transform`, the single seam where the DFT implementation
can be swapped for a hand-written one.
"""

__version__ = "0.1.0"
