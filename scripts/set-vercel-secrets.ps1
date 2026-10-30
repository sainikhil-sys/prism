# Adds the four secret Production variables to the linked Vercel project (see .vercel/project.json).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File .\scripts\set-vercel-secrets.ps1
#
# - Database URLs are typed or pasted at hidden prompts; they are never printed or written to disk.
# - BETTER_AUTH_SECRET and IP_HASH_SALT are generated here with a cryptographic random generator.
# - All four are stored as Sensitive variables, which cannot be read back from Vercel.
$ErrorActionPreference = "Stop"

function Read-Hidden([string]$Prompt) {
  $secure = Read-Host -AsSecureString $Prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function New-Secret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Add-Secret([string]$Name, [string]$Value) {
  # The CLI prints its banner on stderr; Windows PowerShell 5.1 would turn that into a terminating
  # error under "Stop", so judge success by the exit code only and discard all output.
  $ErrorActionPreference = "Continue"
  $null = & vercel env add $Name --environment production --value $Value --sensitive --force --yes 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Vercel rejected $Name (exit code $LASTEXITCODE). Output hidden to protect the value." }
  Write-Host "  added $Name"
}

if (-not (Test-Path ".vercel\project.json")) { throw "Run this from the Prism folder (no .vercel\project.json here)." }
$project = (Get-Content ".vercel\project.json" -Raw | ConvertFrom-Json).projectName
Write-Host "Adding Production variables to Vercel project '$project'."

$databaseUrl = Read-Hidden "Pooled DATABASE_URL (input hidden)"
if ($databaseUrl -notmatch '^postgres(ql)?://') { throw "DATABASE_URL must start with postgres:// or postgresql://" }
$directUrl = Read-Hidden "Direct DIRECT_DATABASE_URL (input hidden, Enter to reuse DATABASE_URL)"
if (-not $directUrl) { $directUrl = $databaseUrl }
if ($directUrl -notmatch '^postgres(ql)?://') { throw "DIRECT_DATABASE_URL must start with postgres:// or postgresql://" }

Add-Secret "DATABASE_URL" $databaseUrl
Add-Secret "DIRECT_DATABASE_URL" $directUrl
Add-Secret "BETTER_AUTH_SECRET" (New-Secret)
Add-Secret "IP_HASH_SALT" (New-Secret)

$databaseUrl = $null; $directUrl = $null
Write-Host "Done. All four variables are stored as Sensitive in Production."
