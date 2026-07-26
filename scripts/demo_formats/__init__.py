"""Writers for the creative file formats in the demo asset pack.

One module per format family, mirroring the app's own `main/formats/` layout.
Each module produces *real* files of that format — not stubs — so the demo pack
exercises the same code paths a designer's own files would:

    raster.py     PNG and JPG artwork (Pillow)
    vector.py     SVG markup
    photoshop.py  layered PSD and PSB documents, with the thumbnail Photoshop
                  embeds so Chronicle can preview them
    mesh.py       Wavefront OBJ geometry
    step.py       STEP AP214 faceted solids
    blend.py      Blender .blend containers (see that module's caveat)

Only Pillow is required, and only for the raster artwork and the embedded
previews. Everything else is written byte by byte from the format
specifications.
"""
