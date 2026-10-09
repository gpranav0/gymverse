param([string]$InputDoc, [string]$OutputPdf)
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
try {
  $wordDoc = $wordApp.Documents.Open($InputDoc, $false, $true)
  $wordDoc.ExportAsFixedFormat($OutputPdf, 17)
  $wordDoc.Close(0)
} finally {
  $wordApp.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp) | Out-Null
}
