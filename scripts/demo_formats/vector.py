"""SVG artwork for the demo pack.

Hand-written markup rather than an exported blob: the file stays small, reads
clearly in a diff, and each version differs in a way a person (and later an AI)
can name — a flipped mark, a palette change.

Version 1 is the real Chronicle mark mirrored left-to-right in an amber palette,
the way an early draft looked before the brand settled; version 2 corrects the
orientation; version 3 is today's blue mark, matching
`packages/brand/assets/chronicle-mark-dark.svg`.
"""

from __future__ import annotations

# The real Chronicle mark geometry, on its 48×48 grid.
_ARC = "M38 12H19C11.8 12 8 16 8 22s3.8 10 11 10h12c5.5 0 8 2.7 8 7"
_HIGHLIGHT = "M38 12H19c-4.4 0-7.5 1.5-9.2 4.2"

#: Amber draft palette, then the official blue one, in (arc, highlight, head, tail) order.
_AMBER = ("#f26b1d", "#ff9a5c", "#ffc49b", "#ff9a5c")
_BLUE = ("#0f62fe", "#78a9ff", "#a6c8ff", "#78a9ff")


def chronicle_mark(version: int) -> str:
    """The Chronicle mark: mirrored amber draft → corrected → official blue."""
    mirrored = version == 1
    arc, highlight, head, tail = _AMBER if version < 3 else _BLUE

    # A horizontal flip about the centre of the 48-unit canvas.
    open_group = '<g transform="translate(48, 0) scale(-1, 1)">' if mirrored else "<g>"
    label = {
        1: "Chronicle mark — amber draft, mirrored",
        2: "Chronicle mark — amber draft",
        3: "Chronicle mark",
    }[version]

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <title>{label}</title>
  {open_group}
    <path d="{_ARC}" stroke="{arc}" stroke-width="8" stroke-linecap="round"/>
    <path d="{_HIGHLIGHT}" stroke="{highlight}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="38" cy="12" r="6" fill="{head}"/>
    <circle cx="39" cy="39" r="5" fill="{tail}"/>
  </g>
</svg>
"""
