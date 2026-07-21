$ErrorActionPreference = 'Stop'

$conceptDir = Resolve-Path $PSScriptRoot
$pngDir = Join-Path $conceptDir 'png'
New-Item -ItemType Directory -Force -Path $pngDir | Out-Null

& node (Join-Path $conceptDir 'render-concepts.mjs')
if ($LASTEXITCODE -ne 0) { throw 'resvg failed to render the icon concepts' }

$python = @'
from pathlib import Path
import sys
from PIL import Image

root = Path(sys.argv[1])
for source in sorted(root.glob("?-*-256.png")):
    output = root.parent / f"{source.stem.removesuffix('-256')}.ico"
    with Image.open(source) as image:
        image.save(output, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
'@
$python | python - $pngDir
if ($LASTEXITCODE -ne 0) { throw 'Python/Pillow failed to build concept ICO files' }

Write-Output "Exported temporary icon concepts to $conceptDir"
