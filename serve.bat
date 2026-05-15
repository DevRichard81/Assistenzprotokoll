@echo off
set PORT=5173
echo Starting simple server on http://localhost:%PORT%...
echo Press Ctrl+C to stop.

powershell -NoProfile -Command "& { $p = %PORT%; $w = Join-Path $pwd 'dist'; if (!(Test-Path $w)) { echo 'Error: dist folder not found. Run npm run build first.'; exit }; $l = [System.Net.HttpListener]::new(); $l.Prefixes.Add(\"http://localhost:$p/\"); $l.Start(); while($l.IsListening) { $c = $l.GetContext(); $r = $c.Request; $s = $c.Response; $path = Join-Path $w $r.Url.LocalPath.TrimStart('/'); if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }; if (!(Test-Path $path)) { $path = Join-Path $w 'index.html' }; $bytes = [System.IO.File]::ReadAllBytes($path); $s.ContentLength64 = $bytes.Length; $ext = [System.IO.Path]::GetExtension($path); $s.ContentType = switch($ext) { '.html' { 'text/html' } '.js' { 'application/javascript' } '.css' { 'text/css' } '.svg' { 'image/svg+xml' } '.json' { 'application/json' } '.webmanifest' { 'application/manifest+json' } default { 'application/octet-stream' } }; $s.OutputStream.Write($bytes, 0, $bytes.Length); $s.Close() } }"
