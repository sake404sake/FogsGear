Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
$canvasSize = 320
$center = 160
$radius = 132

function Draw-LineSpokes($graphics, $radius, $count, $inner, $outer, $pen) {
    for ($i = 0; $i -lt $count; $i++) {
        $angle = $i * [Math]::PI * 2 / $count
        $x1 = $radius * $inner * [Math]::Cos($angle)
        $y1 = $radius * $inner * [Math]::Sin($angle)
        $x2 = $radius * $outer * [Math]::Cos($angle)
        $y2 = $radius * $outer * [Math]::Sin($angle)
        $graphics.DrawLine($pen, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
    }
}

function Draw-Holes($graphics, $radius, $count, $scale, $size, $pen) {
    for ($i = 0; $i -lt $count; $i++) {
        $angle = $i * [Math]::PI * 2 / $count
        $x = $radius * $scale * [Math]::Cos($angle) - $size
        $y = $radius * $scale * [Math]::Sin($angle) - $size
        $graphics.DrawEllipse($pen, [float]$x, [float]$y, [float]($size * 2), [float]($size * 2))
    }
}

function Draw-Ring($graphics, $radius, $scale, $pen) {
    $r = $radius * $scale
    $graphics.DrawEllipse($pen, [float]-$r, [float]-$r, [float]($r * 2), [float]($r * 2))
}

function Draw-Design($graphics, $style, $pen, $radius, $supportPen) {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.FillEllipse([System.Drawing.Brushes]::White, [float](-$radius * .2), [float](-$radius * .2), [float]($radius * .4), [float]($radius * .4))
    if ($style -eq 'industrial') {
        Draw-Ring $graphics $radius .52 $pen; Draw-LineSpokes $graphics $radius 6 .16 .76 $pen; return
    }
    if ($style -eq 'alchemical') {
        Draw-Ring $graphics $radius .3 $pen; Draw-Ring $graphics $radius .58 $pen
        Draw-LineSpokes $graphics $radius 3 .16 .82 $pen; return
    }
    if ($style -eq 'logistics') {
        Draw-Ring $graphics $radius .68 $pen; Draw-LineSpokes $graphics $radius 4 .16 .68 $pen
        Draw-Ring $graphics $radius .34 $pen; return
    }
    if ($style -eq 'clockwork') {
        Draw-Ring $graphics $radius .42 $pen; Draw-LineSpokes $graphics $radius 8 .16 .72 $pen
        Draw-Ring $graphics $radius .76 $supportPen; return
    }
    if ($style -eq 'production') {
        Draw-Ring $graphics $radius .26 $pen; Draw-Ring $graphics $radius .52 $pen
        Draw-LineSpokes $graphics $radius 8 .26 .78 $pen; return
    }
    if ($style -eq 'core') {
        Draw-Ring $graphics $radius .42 $pen; Draw-LineSpokes $graphics $radius 8 .16 .72 $pen; return
    }
}

function New-GearPng($name, $teeth, $style) {
    $bitmap = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.TranslateTransform($center, $center)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 7)
    $outerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 20)
    $supportPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outerPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outerPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.FillEllipse([System.Drawing.Brushes]::White, [float](-$radius - 10), [float](-$radius - 10), [float](($radius + 10) * 2), [float](($radius + 10) * 2))
    $graphics.FillEllipse([System.Drawing.Brushes]::Transparent, [float](-$radius + 18), [float](-$radius + 18), [float](($radius - 18) * 2), [float](($radius - 18) * 2))
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.DrawEllipse($outerPen, [float]-$radius, [float]-$radius, [float]($radius * 2), [float]($radius * 2))
    $graphics.DrawEllipse($pen, [float](-$radius * .78), [float](-$radius * .78), [float]($radius * 1.56), [float]($radius * 1.56))
    Draw-Design $graphics $style $pen $radius $supportPen
    if ($style -eq 'core') {
        $graphics.DrawEllipse($pen, [float](-$radius*.3), [float](-$radius*.3), [float]($radius*.6), [float]($radius*.6))
        $graphics.FillEllipse([System.Drawing.Brushes]::White, [float](-$radius*.12), [float](-$radius*.12), [float]($radius*.24), [float]($radius*.24))
    }
    $graphics.Dispose(); $pen.Dispose(); $outerPen.Dispose(); $supportPen.Dispose()
    $bitmap.Save((Join-Path $assetDirectory "gear-$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$designs = @{
    industrial = 'industrial'
    alchemical = 'alchemical'
    logistics = 'logistics'
    clockwork = 'clockwork'
    production = 'production'
}
foreach ($designName in $designs.Keys) {
    New-GearPng $designName 48 $designs[$designName]
}
New-GearPng 'core' 24 'core'