# make-appicon.ps1 - generate the Windows app icon (.ico): a white rounded-square with the brand
# glyph (Claude starburst + left arrow) in terracotta. The Windows twin of gui/icon/make-appicon.swift.
# Writes a multi-resolution PNG-based .ico (256/128/64/48/32/16), which Windows 10/11 render.
#
#   powershell -ExecutionPolicy Bypass -File .\icon\make-appicon.ps1
param(
    [string]$GlyphPng = (Join-Path $PSScriptRoot '..\..\..\assets\claude-rtl-statusTemplate@2x.png'),
    [string]$OutIco   = (Join-Path $PSScriptRoot '..\Assets\app.ico')
)
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $GlyphPng).Path)
$terra = [System.Drawing.Color]::FromArgb(0xBD, 0x45, 0x2E)   # Claude terracotta
$sizes = 256, 128, 64, 48, 32, 16
$pngs = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    # White rounded-square (squircle-ish)
    $m = [double]$s * 0.055
    $side = $s - 2 * $m
    $d = [double]$side * 0.44        # corner diameter (radius * 2)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($m, $m, $d, $d, 180, 90)
    $path.AddArc($m + $side - $d, $m, $d, $d, 270, 90)
    $path.AddArc($m + $side - $d, $m + $side - $d, $d, $d, 0, 90)
    $path.AddArc($m, $m + $side - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath([System.Drawing.Brushes]::White, $path)

    # Glyph tinted terracotta, centered at ~60%
    $rows = New-Object 'float[][]' 5
    for ($i = 0; $i -lt 5; $i++) { $rows[$i] = New-Object 'float[]' 5 }
    $rows[3][3] = 1
    $rows[4][0] = $terra.R / 255; $rows[4][1] = $terra.G / 255; $rows[4][2] = $terra.B / 255; $rows[4][4] = 1
    $cm = New-Object System.Drawing.Imaging.ColorMatrix (, $rows)
    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm)
    # Crop the glyph to its content bounds (the PNG pads heavily, esp. vertically) and scale large.
    $srcX = 3; $srcY = 8; $srcW = 39; $srcH = 28
    $destW = [int]([double]$s * 0.88); $destH = [int]($destW * $srcH / $srcW)
    $destX = [int](($s - $destW) / 2); $destY = [int](($s - $destH) / 2)
    $rect = New-Object System.Drawing.Rectangle $destX, $destY, $destW, $destH
    $g.DrawImage($src, $rect, $srcX, $srcY, $srcW, $srcH, [System.Drawing.GraphicsUnit]::Pixel, $ia)

    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , ($ms.ToArray())
    $bmp.Dispose()
}

# Assemble a PNG-based .ico
$outPath = [System.IO.Path]::GetFullPath($OutIco)
New-Item -ItemType Directory -Force -Path (Split-Path $outPath) | Out-Null
$stream = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $stream
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)   # ICONDIR
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $data = $pngs[$i]
    $bw.Write([byte]($s -band 0xFF)); $bw.Write([byte]($s -band 0xFF))   # w,h (256 -> 0)
    $bw.Write([byte]0); $bw.Write([byte]0)                              # colors, reserved
    $bw.Write([uint16]1); $bw.Write([uint16]32)                          # planes, bpp
    $bw.Write([uint32]$data.Length); $bw.Write([uint32]$offset)
    $offset += $data.Length
}
foreach ($data in $pngs) { $bw.Write($data) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($outPath, $stream.ToArray())
$src.Dispose()
Write-Host ("wrote {0} ({1} bytes, sizes: {2})" -f $outPath, (Get-Item $outPath).Length, ($sizes -join ','))
