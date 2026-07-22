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
EXECUTABLE_NAME = "chronicle-ai-sidecar.exe" if sys.platform == "win32" else "chronicle-ai-sidecar"
DEFAULT_EXECUTABLE = ROOT / "apps" / "desktop" / "build" / "sidecar" / EXECUTABLE_NAME


def main() -> None:
    executable = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_EXECUTABLE
    if not executable.is_file():
        raise SystemExit(f"Sidecar executable not found: {executable}")

    provider_check = subprocess.run(
        [str(executable), "--check-provider-imports"],
        cwd=executable.parent,
        capture_output=True,
        text=True,
        timeout=30,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if provider_check.returncode != 0:
        raise RuntimeError(
            "Packaged provider import check failed: "
            + (provider_check.stderr.strip() or provider_check.stdout.strip())
        )
    print(provider_check.stdout.strip())

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
