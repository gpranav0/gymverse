<#
.SYNOPSIS
  Builds the GymVerse database from the SQL scripts in database/.

.DESCRIPTION
  Creates the database (optionally dropping an existing one), then runs every SQL file in
  dependency order: 01-06 (schema, constraints, indexes, functions, triggers, views),
  09-17 (later changes), and finally 07_seed.sql. 08_queries.sql is NOT run: it holds
  sample reports and two transaction demos that insert extra rows.

  Stops at the first SQL error instead of leaving a half-built schema.

.EXAMPLE
  .\build_database.ps1 -DbPassword root

.EXAMPLE
  .\build_database.ps1 -Database gymverse_demo -DbPassword root -Force -NoSeed
#>
[CmdletBinding()]
param(
  [string]$Database = 'gymverse',
  [string]$DbUser = 'postgres',
  [string]$DbPassword,
  [string]$DbHost = 'localhost',
  [int]$Port = 5432,
  [string]$PsqlPath,
  [switch]$NoSeed,      # skip the sample data
  [switch]$Force        # drop the database first if it already exists
)

$ErrorActionPreference = 'Stop'
$sqlDir = Join-Path $PSScriptRoot 'database'

# --- locate psql -------------------------------------------------------------
if (-not $PsqlPath) {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) {
    $PsqlPath = $cmd.Source
  } else {
    $PsqlPath = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
}
if (-not $PsqlPath -or -not (Test-Path $PsqlPath)) {
  throw "psql not found. Install PostgreSQL or pass -PsqlPath 'C:\Program Files\PostgreSQL\18\bin\psql.exe'."
}
if ($DbPassword) { $env:PGPASSWORD = $DbPassword }
if (-not $env:PGPASSWORD) {
  Write-Host 'No password given; psql will prompt. Use -DbPassword or set $env:PGPASSWORD to avoid that.' -ForegroundColor Yellow
}

function Invoke-Psql {
  param([string]$TargetDb, [string[]]$Arguments)
  & $PsqlPath -h $DbHost -p $Port -U $DbUser -d $TargetDb -v ON_ERROR_STOP=1 @Arguments
  if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE)." }
}

# --- build order -------------------------------------------------------------
# 01-06 build the original design, 09-17 are later changes, 07 seeds data last so the rows
# land in the final table shape. Plain numeric order would be wrong.
$files = @(
  '01_schema', '02_constraints', '03_indexes', '04_functions', '05_triggers', '06_views',
  '09_add_user_status', '10_integrity', '11_hardening', '12_trainer_assignments',
  '13_account_security', '14_maintenance_jobs', '15_revoked_tokens', '16_performance',
  '17_audit_redaction'
)
if (-not $NoSeed) { $files += '07_seed' }

foreach ($f in $files) {
  $path = Join-Path $sqlDir "$f.sql"
  if (-not (Test-Path $path)) { throw "Missing SQL file: $path" }
}

# --- create the database -----------------------------------------------------
Write-Host "psql:   $PsqlPath"
Write-Host "target: $DbUser@${DbHost}:$Port/$Database"
Write-Host ''

$exists = & $PsqlPath -h $DbHost -p $Port -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($LASTEXITCODE -ne 0) { throw "Could not reach PostgreSQL at ${DbHost}:$Port. Is the server running?" }

if ($exists -eq '1') {
  if (-not $Force) {
    throw "Database '$Database' already exists. Re-run with -Force to drop and rebuild it, or run 'npm run migrate' in gymverse-backend to update it in place."
  }
  Write-Host "Dropping existing database '$Database' ..." -ForegroundColor Yellow
  Invoke-Psql -TargetDb 'postgres' -Arguments @('-q', '-c', "DROP DATABASE IF EXISTS ""$Database"" WITH (FORCE)")
}
Invoke-Psql -TargetDb 'postgres' -Arguments @('-q', '-c', "CREATE DATABASE ""$Database""")
Write-Host "Created database '$Database'."
Write-Host ''

# --- run the SQL files -------------------------------------------------------
$step = 0
foreach ($f in $files) {
  $step++
  Write-Host ("[{0,2}/{1}] {2}" -f $step, $files.Count, $f)
  Invoke-Psql -TargetDb $Database -Arguments @('-q', '-f', (Join-Path $sqlDir "$f.sql"))
}

# --- report ------------------------------------------------------------------
$summary = & $PsqlPath -h $DbHost -p $Port -U $DbUser -d $Database -tAc "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') || ' tables, ' || (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public') || ' views, ' || (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') || ' functions, ' || (SELECT COUNT(*) FROM members) || ' members, ' || (SELECT COUNT(*) FROM attendance) || ' check-ins'"
if ($LASTEXITCODE -ne 0) { throw 'Build finished but the summary query failed.' }

Write-Host ''
Write-Host "Done: $summary" -ForegroundColor Green
if (-not $NoSeed) {
  Write-Host 'Seeded logins use the password Password@123 (admin@gymverse.com, rec@gymverse.com).'
}
Write-Host "Sample reports: psql -d $Database -f database/08_queries.sql   (also inserts demo rows)"
