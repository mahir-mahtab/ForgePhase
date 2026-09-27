"""Development server that restarts whenever the backend code changes.

Run it with the project's Python: ``python dev.py`` from this directory.

``uvicorn --reload`` is not used because on Windows it restarts its worker by
sending a Ctrl+C event, which never arrives when the server has no console
window (started from an IDE or a desktop app), so the reload hangs and the old
code keeps serving. ``watchfiles`` terminates the worker outright instead.
"""

from pathlib import Path

import uvicorn
import watchfiles

PACKAGE = Path(__file__).resolve().parent / "phaseforge"


def serve():
    uvicorn.run("phaseforge.api.app:app", host="127.0.0.1", port=8000)


if __name__ == "__main__":
    watchfiles.run_process(PACKAGE, target=serve, watch_filter=watchfiles.PythonFilter())
