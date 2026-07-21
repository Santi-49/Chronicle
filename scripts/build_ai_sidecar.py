"""Build Chronicle's self-contained Windows AI sidecar with PyInstaller."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import time
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SERVICE_DIR = ROOT / "services" / "ai"
DESKTOP_BUILD = ROOT / "apps" / "desktop" / "build"
DIST_DIR = DESKTOP_BUILD / "sidecar"
WORK_DIR = DESKTOP_BUILD / "pyinstaller-work"
SPEC_DIR = DESKTOP_BUILD / "pyinstaller-spec"
BUNDLE_ENV_DIR = DESKTOP_BUILD / "sidecar-venv"
DEPENDENCY_MARKER = BUNDLE_ENV_DIR / ".chronicle-bundle-dependencies.sha256"
BUILD_MARKER = DESKTOP_BUILD / ".chronicle-sidecar-build.sha256"
BUNDLE_LAYOUT_VERSION = "providers-v1"
PROVIDER_PACKAGES = (
    ("langchain-google-genai", "langchain_google_genai"),
    ("langchain-openai", "langchain_openai"),
    ("langchain-anthropic", "langchain_anthropic"),
)


def _venv_python() -> Path:
    return BUNDLE_ENV_DIR / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def _fingerprint(*paths: Path, include_python: bool = False) -> str:
    digest = hashlib.sha256()
    if include_python:
        digest.update(f"{sys.version_info.major}.{sys.version_info.minor}".encode())
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _prepare_build_directory(target: Path, *, clean: bool) -> None:
    resolved = target.resolve()
    if DESKTOP_BUILD.resolve() not in resolved.parents:
        raise RuntimeError(f"Unexpected build path: {resolved}")
    if clean:
        shutil.rmtree(resolved, ignore_errors=True)
    resolved.mkdir(parents=True, exist_ok=True)


def _ensure_bundle_environment() -> bool:
    """Re-run inside a cached, provider-only environment when needed.

    Returns true only in the interpreter that should execute PyInstaller. The
    dedicated environment prevents unrelated globally installed Python modules
    and their PyInstaller hooks from expanding or slowing the bundle analysis.
    """

    requested_python = os.environ.get("CHRONICLE_SIDECAR_PYTHON", "").strip()
    if requested_python:
        requested = Path(requested_python).resolve()
        if requested != Path(sys.executable).resolve():
            subprocess.run([str(requested), str(Path(__file__).resolve())], check=True)
            return False
        return True

    python = _venv_python()
    if not python.is_file():
        if sys.version_info < (3, 12):
            raise SystemExit("Python 3.12 or newer is required to build the AI sidecar.")
        print(f"Creating isolated sidecar environment at {BUNDLE_ENV_DIR.relative_to(ROOT)}...")
        venv.EnvBuilder(with_pip=True).create(BUNDLE_ENV_DIR)
    else:
        pip_check = subprocess.run(
            [str(python), "-m", "pip", "--version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if pip_check.returncode != 0:
            subprocess.run([str(python), "-m", "ensurepip", "--upgrade"], check=True)

    dependency_fingerprint = _fingerprint(SERVICE_DIR / "pyproject.toml")
    installed_fingerprint = (
        DEPENDENCY_MARKER.read_text(encoding="utf-8").strip()
        if DEPENDENCY_MARKER.is_file()
        else ""
    )
    if installed_fingerprint != dependency_fingerprint:
        started = time.perf_counter()
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--upgrade",
                "-e",
                f"{SERVICE_DIR}[providers,bundle]",
            ],
            check=True,
        )
        DEPENDENCY_MARKER.write_text(dependency_fingerprint, encoding="utf-8")
        print(f"Sidecar dependencies ready in {time.perf_counter() - started:.1f}s.")

    environment = os.environ.copy()
    environment["CHRONICLE_SIDECAR_PYTHON"] = str(python.resolve())
    subprocess.run([str(python), str(Path(__file__).resolve())], check=True, env=environment)
    return False


def main() -> None:
    if sys.platform != "win32":
        raise SystemExit("The MVP installer sidecar must be built on Windows.")

    if not _ensure_bundle_environment():
        return

    _prepare_build_directory(DIST_DIR, clean=True)

    build_fingerprint = hashlib.sha256(
        (
            _fingerprint(SERVICE_DIR / "pyproject.toml", include_python=True)
            + BUNDLE_LAYOUT_VERSION
        ).encode()
    ).hexdigest()
    previous_build_fingerprint = (
        BUILD_MARKER.read_text(encoding="utf-8").strip() if BUILD_MARKER.is_file() else ""
    )
    if previous_build_fingerprint and previous_build_fingerprint != build_fingerprint:
        for target in (WORK_DIR, SPEC_DIR):
            _prepare_build_directory(target, clean=True)
    for target in (WORK_DIR, SPEC_DIR):
        _prepare_build_directory(target, clean=False)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--name",
        "chronicle-ai-sidecar",
        "--paths",
        str(SERVICE_DIR),
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(WORK_DIR),
        "--specpath",
        str(SPEC_DIR),
        "--copy-metadata",
        "chronicle-ai",
    ]
    for distribution, module in PROVIDER_PACKAGES:
        command.extend(("--copy-metadata", distribution, "--hidden-import", module))
    command.append(str(SERVICE_DIR / "chronicle_ai" / "__main__.py"))

    BUILD_MARKER.write_text(build_fingerprint, encoding="utf-8")
    started = time.perf_counter()
    subprocess.run(command, cwd=SERVICE_DIR, check=True)

    executable = DIST_DIR / "chronicle-ai-sidecar.exe"
    if not executable.is_file() or executable.stat().st_size == 0:
        raise RuntimeError(f"Sidecar build did not produce {executable}")
    print(
        f"Built {executable.relative_to(ROOT)} ({executable.stat().st_size:,} bytes) "
        f"in {time.perf_counter() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
