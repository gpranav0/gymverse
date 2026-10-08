[CmdletBinding()]
param(
    [switch]$Rebuild,
    [switch]$DemoData,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$taskEnvFile = Join-Path $PSScriptRoot '.env.docker'
$taskComposeFile = Join-Path $PSScriptRoot 'compose.yaml'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed or is not on PATH. Install/start Docker Desktop first.'
}
if (-not (Test-Path -LiteralPath $taskEnvFile)) {
    $taskTextFile = Join-Path $PSScriptRoot '.env.docker.txt'
    if (Test-Path -LiteralPath $taskTextFile) {
        Rename-Item -LiteralPath $taskTextFile -NewName '.env.docker'
    } else {
        throw 'Create .env.docker from .env.docker.example and set DB_PASSWORD and JWT_SECRET. See DOCKER.md.'
    }
}

$taskEngine = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or ($taskEngine -join '').Trim() -ne 'linux') {
    throw 'Start Docker Desktop and wait for its Linux engine to run, then retry this script.'
}

function Invoke-GymVerseCompose {
    param([string[]]$Arguments)
    & docker compose --project-directory $PSScriptRoot --env-file $taskEnvFile -f $taskComposeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker command failed. Inspect: docker compose --env-file .env.docker logs --tail 100 db backend frontend'
    }
}

Invoke-GymVerseCompose -Arguments @('config', '--quiet')
if ($Rebuild) {
    Write-Host 'Refreshing PostgreSQL and rebuilding both application images without cached layers...'
    Invoke-GymVerseCompose -Arguments @('pull', 'db')
    Invoke-GymVerseCompose -Arguments @('build', '--pull', '--no-cache', 'backend', 'frontend')
    Invoke-GymVerseCompose -Arguments @('up', '-d', '--force-recreate', '--remove-orphans', '--wait', '--wait-timeout', '120')
} else {
    Invoke-GymVerseCompose -Arguments @('up', '--build', '-d', '--remove-orphans', '--wait', '--wait-timeout', '120')
}

if ($DemoData) {
    Write-Host 'Loading local demo data. Use this only once on an empty database.'
    Invoke-GymVerseCompose -Arguments @('exec', '-T', '-e', 'NODE_ENV=development', 'backend', 'node', 'run_seed.js')
}
if ($Check) {
    Invoke-GymVerseCompose -Arguments @('exec', '-T', 'backend', 'node', 'verify_stack.js')
}
Invoke-GymVerseCompose -Arguments @('ps', '-a')
Write-Host 'GymVerse is ready. Default site: http://localhost:5000; pgAdmin: 127.0.0.1:5433.'
Write-Host 'Use the gymverse group under Docker Desktop Containers to manage this stack.'
