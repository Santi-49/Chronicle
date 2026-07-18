from pathlib import Path


SUPPORTED_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def load_image(file_path: str) -> dict:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {file_path}")

    if not path.is_file():
        raise ValueError(f"Path is not a file: {file_path}")

    extension = path.suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported image format: {extension}")

    mime_type = SUPPORTED_EXTENSIONS[extension]
    data = path.read_bytes()

    return {
        "path": str(path),
        "mime_type": mime_type,
        "data": data,
    }