"""Ciphertext container: a complex array plus its metadata, in one ``.npz``.

DRPE output is complex -- amplitude and phase both carry information, so an
8-bit PNG or WAV cannot hold it without destroying the ability to decrypt.
A ``.npz`` stores the full-precision complex array alongside a JSON metadata
blob (salt, original shape, sample rate, ...) that decryption needs.

Loading never enables ``allow_pickle``: these files arrive from users once the
HTTP API exists, and pickle deserialization would be arbitrary code execution.
"""

import base64
import json

import numpy as np

FORMAT_VERSION = 1


def save_container(path, data, metadata):
    """Write ``data`` (any numpy array) and ``metadata`` (a JSON-able dict)."""
    payload = dict(metadata)
    payload["format_version"] = FORMAT_VERSION
    if isinstance(payload.get("salt"), (bytes, bytearray)):
        payload["salt"] = base64.b64encode(payload["salt"]).decode("ascii")
    np.savez_compressed(path, data=np.asarray(data), meta=np.array(json.dumps(payload)))


def load_container(path):
    """Return ``(data, metadata)``. Raises if the file is not a valid container."""
    with np.load(path, allow_pickle=False) as archive:
        missing = {"data", "meta"} - set(archive.files)
        if missing:
            raise ValueError(f"not a PhaseForge container: missing {sorted(missing)}")
        try:
            data = archive["data"]
            metadata = json.loads(str(archive["meta"]))
        except ValueError:
            raise
        except Exception as error:
            raise ValueError("not a PhaseForge container: unreadable entries") from error

    if not isinstance(metadata, dict):
        raise ValueError("not a PhaseForge container: metadata must be an object")
    version = metadata.get("format_version")
    if version != FORMAT_VERSION:
        raise ValueError(f"unsupported container version {version!r}")
    if isinstance(metadata.get("salt"), str):
        try:
            metadata["salt"] = base64.b64decode(metadata["salt"], validate=True)
        except ValueError:
            raise ValueError("container has an invalid salt") from None
    return data, metadata
