param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$envPath = Join-Path $root '.env.lab6'
$privateDirectory = Join-Path $root '.local'
$accountPath = Join-Path $privateDirectory 'lab6-accounts.private.txt'
function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
if (-not (Test-Path -LiteralPath $envPath)) {
    $accounts = [ordered]@{}
    foreach ($key in @('organizer', 'organizer2', 'participant', 'participant2')) {
        $accounts[$key] = New-LocalSecret
    }
    $json = ConvertTo-Json -InputObject $accounts -Compress
    New-Item -ItemType Directory -Force -Path $privateDirectory | Out-Null
    $privateLines = @('LOCAL LAB 6 ONLY - DO NOT UPLOAD OR INCLUDE IN REPORTS')
    foreach ($key in $accounts.Keys) {
        $privateLines += ('{0}@example.test : {1}' -f $key, $accounts[$key])
    }
    # Write credentials first; a failed write must not leave an apparently ready setup.
    [IO.File]::WriteAllLines($accountPath, $privateLines, [Text.UTF8Encoding]::new($false))
    $lines = @(
        ('LAB6_DB_PASSWORD=' + (New-LocalSecret)),
        ('LAB6_SESSION_SECRET=' + (New-LocalSecret)),
        ("LAB6_ACCOUNT_PASSWORDS_JSON='" + $json + "'")
    )
    [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
} elseif (-not (Test-Path -LiteralPath $accountPath)) {
    throw 'Private account file is missing. Do not regenerate credentials for an existing database. Recover the matching file or use a fresh isolated folder/project.'
}
Write-Host 'Private local configuration is ready. Credentials are not printed.'
Write-Host ('Open locally for test-account passwords: ' + $accountPath)
if ($PrepareOnly) { return }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop / Docker Compose is required. Start Docker Desktop and run this command again.'
}
& docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not ready.' }
& docker compose --env-file .env.lab6 -p gather-lab6-special -f compose.lab6.yaml config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration validation failed.' }
& docker compose --env-file .env.lab6 -p gather-lab6-special -f compose.lab6.yaml up --build --wait --wait-timeout 240 app
if ($LASTEXITCODE -ne 0) { throw 'Exercise startup failed. Inspect service logs privately; redact credentials before sharing.' }
Write-Host 'Open http://localhost:3106/events'
Write-Host 'Stop without deleting data: docker compose --env-file .env.lab6 -p gather-lab6-special -f compose.lab6.yaml down'
