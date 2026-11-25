Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path (Get-Location) "assets/icon.png"
$destPath512 = Join-Path (Get-Location) "assets/playstore-icon-512.png"
$destPathFeature = Join-Path (Get-Location) "assets/playstore-feature-graphic-1024x500.png"

# 1. Generate 512x512 App Icon
$src = [System.Drawing.Image]::FromFile($srcPath)
$dest512 = New-Object System.Drawing.Bitmap(512, 512)
$g512 = [System.Drawing.Graphics]::FromImage($dest512)
$g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g512.DrawImage($src, 0, 0, 512, 512)
$dest512.Save($destPath512, [System.Drawing.Imaging.ImageFormat]::Png)
$g512.Dispose()
$dest512.Dispose()
Write-Host "Created $destPath512"

# 2. Generate 1024x500 Feature Graphic
$destFeature = New-Object System.Drawing.Bitmap(1024, 500)
$gFeature = [System.Drawing.Graphics]::FromImage($destFeature)
$gFeature.Clear([System.Drawing.ColorTranslator]::FromHtml("#0D0E12"))
$gFeature.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Draw logo centered on the left or middle
$logoSize = 280
$logoX = [int]((1024 - $logoSize) / 2)
$logoY = [int]((500 - $logoSize) / 2) - 20
$gFeature.DrawImage($src, $logoX, $logoY, $logoSize, $logoSize)

# Draw "DAYMARK" text
$font = New-Object System.Drawing.Font("Arial", 28, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#F3F4F8"))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 370, 1024, 60)
$gFeature.DrawString("DAYMARK", $font, $brush, $rect, $format)

$fontSub = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Regular)
$brushSub = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#10B981"))
$rectSub = New-Object System.Drawing.RectangleF(0, 420, 1024, 40)
$gFeature.DrawString("Habit Tracker & Daily Routine Planner", $fontSub, $brushSub, $rectSub, $format)

$destFeature.Save($destPathFeature, [System.Drawing.Imaging.ImageFormat]::Png)
$gFeature.Dispose()
$destFeature.Dispose()
$src.Dispose()
Write-Host "Created $destPathFeature"
