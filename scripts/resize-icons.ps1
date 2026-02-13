Add-Type -AssemblyName System.Drawing

function Resize-Image($path, $size) {
    $img = [System.Drawing.Image]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.DrawImage($img, 0, 0, $size, $size)
    
    $img.Dispose()
    
    $tempPath = $path + ".tmp.png"
    $bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $g.Dispose()
    
    Move-Item -Path $tempPath -Destination $path -Force
}

Resize-Image "c:\Users\vicdu\Documents\Antigravity projects\luminapdf\public\icon-512.png" 512
Resize-Image "c:\Users\vicdu\Documents\Antigravity projects\luminapdf\public\icon-192.png" 192
