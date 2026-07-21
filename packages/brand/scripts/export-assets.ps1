$ErrorActionPreference = 'Stop'

$assetDir = Resolve-Path (Join-Path $PSScriptRoot '..\assets')
$pngDir = Join-Path $assetDir 'png'
New-Item -ItemType Directory -Force -Path $pngDir | Out-Null

& node (Join-Path $PSScriptRoot 'render-pngs.mjs')
if ($LASTEXITCODE -ne 0) { throw 'resvg failed to render the PNG assets' }

$iconSource = Join-Path $pngDir 'chronicle-app-icon-dark-512.png'
$iconOutput = Join-Path $assetDir 'chronicle-app-icon.ico'
$python = @'
from pathlib import Path
import sys
from PIL import Image

source, output = map(Path, sys.argv[1:])
with Image.open(source) as image:
    image.save(output, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
'@
$python | python - $iconSource $iconOutput
if ($LASTEXITCODE -ne 0) { throw 'Python/Pillow failed to build the Windows icon' }

Write-Output "Exported Chronicle brand assets to $assetDir"
