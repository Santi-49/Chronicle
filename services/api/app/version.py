"""Runtime package version sourced from installed distribution metadata."""

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import tomllib


def package_version() -> str:
    """Return the pyproject version, or an explicit development fallback."""

    try:
        return version("chronicle-control-plane")
    except PackageNotFoundError:
        pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
        if pyproject.is_file():
            with pyproject.open("rb") as handle:
                return tomllib.load(handle)["project"]["version"]
        return "0.0.0+unknown"


API_VERSION = package_version()
