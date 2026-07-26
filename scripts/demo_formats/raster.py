"""Pillow artwork: the JPG assets, the layer artwork inside the PSD/PSB
documents, and the preview embedded in the `.blend` container.

Every renderer takes a version number and returns an image, so each version
changes one obvious thing — a colour swap, a price change, a removed line of
copy, an added badge. That is what makes the AI diff demonstrable.
"""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

# --- Palette ---------------------------------------------------------------
NAVY = (18, 28, 71)
TEAL = (13, 115, 119)
ORANGE = (222, 106, 30)
AMBER = (242, 107, 29)
PURPLE = (91, 46, 138)
BLUE = (15, 98, 254)
SKY = (120, 169, 255)
INK = (24, 24, 27)
PAPER = (247, 247, 248)
CLOUD = (228, 230, 235)
GREY = (120, 124, 132)
SLATE = (57, 61, 71)
GREEN = (46, 139, 87)
RED = (200, 52, 52)
WHITE = (250, 250, 250)
DUSK = (46, 41, 78)
DAWN = (232, 154, 88)


# --- Text helpers ----------------------------------------------------------
def font(size: int) -> ImageFont.FreeTypeFont:
    """A scalable font at the requested size, with no system font dependency.

    Pillow bundles a scalable default (``load_default(size=...)`` since v10.1),
    which keeps the rendered assets identical on every machine.
    """
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow: bitmap default, size ignored
        return ImageFont.load_default()


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    body: str,
    size: int,
    fill,
    *,
    weight: int = 1,
    center: bool = False,
) -> None:
    """Draw text, optionally centred on `xy[0]`. `weight` fakes bold by
    overdrawing at small offsets (the bundled font has no bold variant)."""
    x, top = xy
    if center:
        left, _, right, _ = draw.textbbox((0, 0), body, font=font(size))
        x -= (right - left) // 2
    for offset in range(weight):
        draw.text((x + offset, top), body, font=font(size), fill=fill)


# --- JPG assets ------------------------------------------------------------
def banner(version: int, size: tuple[int, int]) -> Image.Image:
    """40% OFF orange → 50% OFF orange → 50% OFF purple with urgency copy."""
    width, height = size
    image = Image.new("RGB", size, PURPLE if version == 3 else ORANGE)
    draw = ImageDraw.Draw(image)
    pad = int(height * 0.18)
    text(draw, (pad, int(height * 0.16)), "SUMMER SALE", int(height * 0.22), WHITE)
    text(draw, (pad, int(height * 0.44)), "40% OFF" if version == 1 else "50% OFF",
         int(height * 0.34), WHITE)
    if version == 3:
        text(draw, (pad, int(height * 0.83)), "Limited time only", int(height * 0.11), CLOUD)
    return image


def product(version: int, size: tuple[int, int]) -> Image.Image:
    """A bottle shot: grey → green → green with a NEW badge."""
    width, height = size
    image = Image.new("RGB", size, CLOUD if version == 3 else PAPER)
    draw = ImageDraw.Draw(image)
    body = GREY if version == 1 else GREEN

    left, right = int(width * 0.36), int(width * 0.64)
    top, bottom = int(height * 0.34), int(height * 0.82)
    draw.rounded_rectangle((left, top, right, bottom), radius=int(width * 0.06), fill=body)
    neck_left, neck_right = int(width * 0.44), int(width * 0.56)
    draw.rectangle((neck_left, int(height * 0.26), neck_right, top + 10), fill=body)
    draw.rounded_rectangle(
        (neck_left - 6, int(height * 0.22), neck_right + 6, int(height * 0.27)),
        radius=8,
        fill=INK,
    )
    draw.rectangle((left, int(height * 0.5), right, int(height * 0.62)), fill=WHITE)

    if version == 3:
        radius = int(width * 0.1)
        cx, cy = int(width * 0.76), int(height * 0.24)
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=RED)
        text(draw, (cx, cy - int(radius * 0.35)), "NEW", int(radius * 0.55), WHITE,
             weight=2, center=True)
    return image


def hero(version: int, size: tuple[int, int]) -> Image.Image:
    """A landscape hero: warm dawn → cool dusk → dusk with a headline."""
    width, height = size
    sky_top = DAWN if version == 1 else DUSK
    sky_bottom = (250, 214, 165) if version == 1 else (95, 84, 150)
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)

    # Vertical gradient sky.
    horizon = int(height * 0.72)
    for row in range(horizon):
        blend = row / max(horizon - 1, 1)
        draw.line(
            (0, row, width, row),
            fill=tuple(
                round(sky_top[channel] + (sky_bottom[channel] - sky_top[channel]) * blend)
                for channel in range(3)
            ),
        )
    # Sun or moon, two ridges, and the foreground.
    disc = int(height * 0.1)
    draw.ellipse(
        (int(width * 0.7), int(height * 0.16), int(width * 0.7) + disc * 2,
         int(height * 0.16) + disc * 2),
        fill=WHITE if version >= 2 else (255, 236, 190),
    )
    draw.polygon(
        [(0, horizon), (int(width * 0.28), int(height * 0.46)), (int(width * 0.52), horizon)],
        fill=SLATE if version >= 2 else (150, 96, 70),
    )
    draw.polygon(
        [(int(width * 0.4), horizon), (int(width * 0.72), int(height * 0.52)), (width, horizon)],
        fill=INK if version >= 2 else (120, 76, 58),
    )
    draw.rectangle((0, horizon, width, height), fill=INK if version >= 2 else (94, 62, 48))

    if version >= 3:
        text(draw, (int(width * 0.06), int(height * 0.79)), "Every version, remembered.",
             int(height * 0.09), WHITE, weight=2)
    return image


# --- Layer artwork for the Photoshop documents ------------------------------
# Each returns {layer name: RGBA artwork}. A layer that disappears between
# versions is the change Chronicle's PSD structure diff is built to name.


def _panel(size: tuple[int, int], fill) -> Image.Image:
    return Image.new("RGBA", size, (*fill, 255))


def _copy_layer(size: tuple[int, int], body: str, size_ratio: float, fill) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    text(draw, (size[0] // 2, 0), body, int(size[1] * size_ratio), fill, weight=2, center=True)
    return layer


def poster_layers(version: int, size: tuple[int, int]) -> dict[str, Image.Image]:
    """Print poster: navy → teal, headline reworded, then the tagline removed."""
    width, height = size
    layers = {
        "backdrop": _panel(size, NAVY if version == 1 else TEAL),
        "headline": _panel((int(width * 0.8), int(height * 0.18)), WHITE),
    }
    draw = ImageDraw.Draw(layers["headline"])
    text(
        draw,
        (layers["headline"].width // 2, int(layers["headline"].height * 0.2)),
        "OPEN STUDIO" if version == 1 else "STUDIO NIGHT",
        int(layers["headline"].height * 0.5),
        INK,
        weight=2,
        center=True,
    )
    if version < 3:
        layers["tagline"] = _copy_layer(
            (int(width * 0.7), int(height * 0.09)), "every version, remembered", 0.8, CLOUD
        )
    return layers


def ad_layers(version: int, size: tuple[int, int]) -> dict[str, Image.Image]:
    """Social ad: price drops in v2, then a SALE badge layer is added in v3."""
    width, height = size
    layers = {
        "backdrop": _panel(size, BLUE if version < 3 else INK),
        "product": _panel((int(width * 0.44), int(height * 0.44)), PAPER),
        "price": _copy_layer(
            (int(width * 0.8), int(height * 0.12)),
            "£49" if version == 1 else "£39",
            0.9,
            WHITE,
        ),
    }
    if version >= 3:
        badge = Image.new("RGBA", (int(width * 0.28), int(width * 0.28)), (0, 0, 0, 0))
        draw = ImageDraw.Draw(badge)
        draw.ellipse((0, 0, badge.width - 1, badge.height - 1), fill=(*RED, 255))
        text(draw, (badge.width // 2, int(badge.height * 0.34)), "SALE",
             int(badge.height * 0.26), WHITE, weight=2, center=True)
        layers["badge"] = badge
    return layers


def billboard_layers(version: int, size: tuple[int, int]) -> dict[str, Image.Image]:
    """Billboard: dusk → dawn artwork, headline reworded, logo lockup added."""
    width, height = size
    layers = {
        "artwork": _panel(size, DUSK if version == 1 else DAWN),
        "headline": _copy_layer(
            (int(width * 0.86), int(height * 0.2)),
            "NEVER LOSE A VERSION" if version == 1 else "EVERY SAVE, EXPLAINED",
            0.7,
            WHITE if version == 1 else INK,
        ),
    }
    if version >= 3:
        lockup = Image.new("RGBA", (int(width * 0.3), int(height * 0.16)), (0, 0, 0, 0))
        draw = ImageDraw.Draw(lockup)
        draw.rounded_rectangle(
            (0, 0, lockup.width - 1, lockup.height - 1), radius=int(lockup.height * 0.2),
            fill=(*INK, 235),
        )
        text(draw, (lockup.width // 2, int(lockup.height * 0.24)), "CHRONICLE",
             int(lockup.height * 0.42), WHITE, weight=2, center=True)
        layers["logo-lockup"] = lockup
    return layers
