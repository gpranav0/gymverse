param(
  [Parameter(Mandatory = $true)][string]$Deck,
  [Parameter(Mandatory = $true)][string]$OutDir
)
# Renders every slide of a .pptx to PNG through PowerPoint (no LibreOffice on this machine).
$ErrorActionPreference = 'Stop'
$Deck = (Resolve-Path $Deck).Path
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

$app = New-Object -ComObject PowerPoint.Application
try {
  # Open(FileName, ReadOnly, Untitled, WithWindow)
  $pres = $app.Presentations.Open($Deck, -1, 0, 0)
  try {
    $pres.Export($OutDir, 'PNG', 1600, 900)
  } finally {
    $pres.Close()
  }
} finally {
  $app.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
Get-ChildItem $OutDir -Filter *.png | Sort-Object { [int]($_.BaseName -replace '\D', '') } | ForEach-Object { $_.Name }
