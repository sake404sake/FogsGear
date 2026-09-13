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
    $graphics.FillEllipse([System.Drawing.Brushes]::White, [float](-$radius * .24), [float](-$radius * .24), [float]($radius * .48), [float]($radius * .48))
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.FillEllipse([System.Drawing.Brushes]::Transparent, [float](-$radius * .1), [float](-$radius * .1), [float]($radius * .2), [float]($radius * .2))
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    Draw-Ring $graphics $radius .16 $pen
    Draw-LineSpokes $graphics $radius 8 .2 .95 $supportPen
    if ($style -eq 'ring') { Draw-LineSpokes $graphics $radius 4 .16 .8 $pen; return }
    if ($style -eq 'sunburst') { Draw-LineSpokes $graphics $radius 6 .16 .8 $pen; Draw-Holes $graphics $radius 6 .5 4 $pen; return }
    if ($style -eq 'holes') { Draw-LineSpokes $graphics $radius 8 .2 .8 $pen; Draw-Holes $graphics $radius 8 .5 9 $pen; return }
    if ($style -eq 'triangular') { Draw-LineSpokes $graphics $radius 4 .18 .8 $pen; Draw-Holes $graphics $radius 4 .5 5 $pen; return }
    if ($style -eq 'wave') {
        for ($i = 0; $i -lt 6; $i++) {
            $state = $graphics.Save()
            $graphics.RotateTransform([float]($i * 60))
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddBezier(-$radius*.1, -$radius*.24, $radius*.3, -$radius*.5, $radius*.58, -$radius*.42, $radius*.8, -$radius*.16)
            $path.AddBezier($radius*.8, -$radius*.16, $radius*.48, $radius*.04, $radius*.25, $radius*.2, $radius*.18, $radius*.26)
            $graphics.DrawPath($pen, $path)
            $path.Dispose(); $graphics.Restore($state)
        }
        return
    }
    if ($style -eq 'crown') { Draw-LineSpokes $graphics $radius 6 .18 .8 $pen; Draw-Ring $graphics $radius .48 $pen; Draw-Holes $graphics $radius 6 .58 5 $pen; return }
    if ($style -eq 'lattice') { Draw-LineSpokes $graphics $radius 8 .18 .84 $pen; Draw-Ring $graphics $radius .34 $pen; Draw-Holes $graphics $radius 8 .55 4 $pen; return }
    if ($style -eq 'radial') { Draw-LineSpokes $graphics $radius 12 .16 .8 $pen; Draw-Ring $graphics $radius .3 $pen; return }
    if ($style -eq 'industrial') { Draw-LineSpokes $graphics $radius 6 .18 .88 $pen; Draw-Ring $graphics $radius .48 $pen; Draw-Holes $graphics $radius 10 .65 5 $pen; return }
    if ($style -eq 'core') { Draw-LineSpokes $graphics $radius 8 .18 .8 $pen; Draw-Holes $graphics $radius 8 .58 6 $pen; return }
}

function New-GearPng($name, $teeth, $style) {
    $bitmap = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.TranslateTransform($center, $center)
    $lineWidth = if ($name -eq 'xxs') { 18 } elseif ($name -eq 'ss') { 16 } elseif ($name -eq 's') { 14 } else { 5 }
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $lineWidth)
    $outerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 20)
    $supportPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outerPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outerPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $toothWidth = [Math]::Max(5, [Math]::Min(18, 2 * [Math]::PI * $radius / $teeth * 0.48))
    $toothHeight = 46
    $toothStart = $radius - 24
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

New-GearPng 'xxs' 4 'ring'
New-GearPng 'ss' 6 'sunburst'
New-GearPng 's' 10 'holes'
New-GearPng 'm' 14 'triangular'
New-GearPng 'l' 18 'wave'
New-GearPng 'll' 24 'crown'
New-GearPng '3l' 32 'lattice'
New-GearPng '4l' 40 'radial'
New-GearPng 'max' 48 'industrial'
New-GearPng 'core' 24 'core'