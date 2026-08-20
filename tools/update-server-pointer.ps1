# Updates the First Table server pointer (a secret gist the app reads at
# launch) to a new public URL. Run this after restarting the tunnel:
#
#   cloudflared tunnel --url http://localhost:8000
#   .\tools\update-server-pointer.ps1 -Url https://<new>.trycloudflare.com
#
param([Parameter(Mandatory = $true)][string]$Url)

$GistId = "ef10ece5c776378d6a3781fe13b155a3"

$body = @{ files = @{ "server.json" = @{ content = (@{ host = $Url } | ConvertTo-Json -Compress) } } } | ConvertTo-Json -Depth 5
$tmp = Join-Path $env:TEMP "ft-pointer-body.json"
$body | Out-File $tmp -Encoding utf8

gh api "gists/$GistId" -X PATCH --input $tmp | Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue

Write-Host "Server pointer now -> $Url"
Write-Host "Phones resolve it on next app launch (no rebuild needed)."
