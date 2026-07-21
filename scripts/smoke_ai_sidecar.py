"""Start a built AI sidecar and verify its loopback health contract."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXECUTABLE = (
    ROOT / "apps" / "desktop" / "build" / "sidecar" / "chronicle-ai-sidecar.exe"
)


def main() -> None:
    executable = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_EXECUTABLE
    if not executable.is_file():
        raise SystemExit(f"Sidecar executable not found: {executable}")

    process = subprocess.Popen(
        [str(executable)],
        cwd=executable.parent,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    try:
        deadline = time.monotonic() + 30
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Sidecar exited early with code {process.returncode}")
            try:
                with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=1) as response:
                    body = json.load(response)
                if (
                    response.status == 200
                    and body.get("status") == "ok"
                    and body.get("service") == "chronicle-ai"
                    and isinstance(body.get("version"), str)
                ):
                    print(f"Sidecar health passed (version {body['version']}).")
                    return
                last_error = RuntimeError(f"Unexpected health response: {body}")
            except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
                last_error = error
            time.sleep(0.25)
        raise RuntimeError(f"Sidecar health timed out: {last_error}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    main()
