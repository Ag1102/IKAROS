# Genera la voz de Atlas en español e inglés con la voz local de Argo (Chatterbox, en la CPU).
#   .\scripts\atlas-voz.ps1                 # ambos idiomas
#   .\scripts\atlas-voz.ps1 -Idiomas en     # solo inglés
# Voz que imita (WAV de 6 a 12 s, con permiso de quien habla), una por idioma para mejor acento:
#   voz\atlas.wav (español) y voz\atlas-en.wav (inglés; si falta, se usa la de español).
#   Otras rutas: -Referencia y -ReferenciaEn. La carpeta voz\ no se sube a git.
# ATLAS_VOZ apunta a la carpeta "voz" de Argo (la que tiene servidor.py y voz.ps1).
param(
  [string[]]$Idiomas = @('es', 'en'),
  [string]$Referencia = (Join-Path (Split-Path $PSScriptRoot -Parent) 'voz\atlas.wav'),
  [string]$ReferenciaEn = (Join-Path (Split-Path $PSScriptRoot -Parent) 'voz\atlas-en.wav')
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$voz = if ($env:ATLAS_VOZ) { $env:ATLAS_VOZ } else { Join-Path $env:USERPROFILE 'Desktop\argon\argo-tutorial-modulos\voz' }
if (-not (Test-Path (Join-Path $voz 'voz.ps1'))) { throw "No encuentro la voz de Argo en $voz. Define ATLAS_VOZ con la ruta de su carpeta 'voz'." }

. (Join-Path $voz 'voz.ps1')
Instalar-Voz
if (-not $env:VOZ_PUERTO) { $env:VOZ_PUERTO = '5299' }
# Voz de Atlas: natural y fluida (frases largas en una sola toma, ritmo pausado).
$env:VOZ_MODELO = 'base'
$env:VOZ_EXPRESION = '0.5'
$env:VOZ_CFG = '0.3'
$env:VOZ_TROZO = '600'

foreach ($idioma in $Idiomas) {
  $ref = if ($idioma -eq 'en' -and (Test-Path $ReferenciaEn)) { $ReferenciaEn } else { $Referencia }
  # La huella de la voz entra en el manifiesto: si cambia la referencia o un ajuste, se regenera ese idioma.
  $huella = "base-e$($env:VOZ_EXPRESION)-c$($env:VOZ_CFG)-t$($env:VOZ_TROZO)"
  if (Test-Path $ref) {
    $env:VOZ_REFERENCIA = (Resolve-Path $ref).Path
    $huella += '-' + (Get-FileHash $ref -Algorithm SHA256).Hash.Substring(0, 8).ToLower()
  } else {
    Remove-Item Env:VOZ_REFERENCIA -ErrorAction SilentlyContinue
  }
  $env:ATLAS_VOZ_HUELLA = $huella
  $env:VOZ_IDIOMA = $idioma
  Write-Host "`n== Atlas en '$idioma' (voz: $(if (Test-Path $ref) { Split-Path $ref -Leaf } else { 'por defecto' }))" -ForegroundColor Cyan
  $proceso = Encender-Voz
  try {
    & node (Join-Path $raiz 'scripts\atlas-voz.mjs') $idioma "http://127.0.0.1:$($env:VOZ_PUERTO)"
    if ($LASTEXITCODE) { throw "La generación en '$idioma' falló." }
  } finally {
    Apagar-Voz $proceso
  }
}
