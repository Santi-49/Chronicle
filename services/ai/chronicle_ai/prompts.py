"""Load Chronicle's versioned annotation prompt from packages/prompts."""

from functools import lru_cache
import os
from pathlib import Path


# services/ai/chronicle_ai/prompts.py → repository root is three levels up.
PROMPT_PATH = Path(
    os.environ.get(
        "CHRONICLE_PROMPT_PATH",
        Path(__file__).resolve().parents[3]
        / "packages"
        / "prompts"
        / "version-annotation.md",
    )
)


@lru_cache(maxsize=1)
def _prompt_sections() -> dict[str, str]:
    """Split Markdown headings without adding a YAML/Markdown dependency."""

    lines = PROMPT_PATH.read_text(encoding="utf-8").splitlines()
    sections = _operation_sections(lines)
    required = (
        "Version diff.System",
        "Version diff.User",
        "First-version description.User",
    )
    if any(key not in sections for key in required):
        raise ValueError(f"Prompt is missing one of these sections: {required}")
    return sections


def _operation_sections(lines: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    operation: str | None = None
    subsection: str | None = None
    buffer: list[str] = []

    def save() -> None:
        if operation and subsection:
            result[f"{operation}.{subsection}"] = "\n".join(buffer).strip()

    for line in lines:
        if line.startswith("## "):
            save()
            operation = line[3:].strip()
            subsection = None
            buffer = []
        elif line.startswith("### "):
            save()
            subsection = line[4:].strip()
            buffer = []
        elif operation and subsection:
            buffer.append(line)
    save()
    return result


def load_annotation_prompt(
    file_name: str,
    is_first_version: bool,
    operation_prefix: str = "",
) -> tuple[str, str]:
    """Return the system and user text for the requested annotation mode.

    ``operation_prefix`` comes from the format's adapter (chronicle_ai.formats),
    so a format's prompt wording is selected by its registry entry rather than
    by a branch here. An empty prefix uses the plain image sections.
    """

    sections = _prompt_sections()
    base = "first-version description" if is_first_version else "version diff"
    operation = f"{operation_prefix}{base}" if operation_prefix else base.capitalize()
    # The prompt says first-version mode uses the same system guidance as a diff.
    system = sections.get("Version diff.System")
    user = sections.get(f"{operation}.User")

    if not system or not user:
        raise ValueError(f"Prompt sections for '{operation}' are incomplete")
    return system, user.replace("{fileName}", file_name)
