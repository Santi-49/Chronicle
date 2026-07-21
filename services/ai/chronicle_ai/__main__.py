"""Executable entry point used by the packaged desktop sidecar."""

import uvicorn

from chronicle_ai.main import app


def main() -> None:
    """Run the loopback-only service on Chronicle's fixed local port."""

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
