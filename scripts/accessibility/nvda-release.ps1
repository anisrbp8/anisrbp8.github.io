# Optional isolated run of the current NV Access patch release with Guidepup.
# Keep the controller's verified distribution intact. Overlay only its runtime
# preferences/certificate files on a clean vendor-generated portable copy.
$ErrorActionPreference = 'Stop'
$release = '2026.3.1'
$controllerAsset = '0.2.1-2026.3'
$expected = '6f80a5b0ca720a7d0d314b5be212f37388bbe81a1107ac3298c1821a1cd3f052'
$vendor = "https://github.com/nvaccess/nvda/releases/download/release-$release/nvda_$release.exe"
$verifiedProfile = Join-Path $env:LOCALAPPDATA "guidepup/nvda/all/$controllerAsset/extracted/userConfig"
$isolated = Join-Path $env:RUNNER_TEMP 'rgaa-nvda-release'
$portable = Join-Path $isolated "nvda/all/$controllerAsset/extracted"
$installer = Join-Path $env:RUNNER_TEMP "rgaa-nvda_$release.exe"
if (-not (Test-Path "$verifiedProfile/remoteAccess/localRelay")) { throw 'Verified Guidepup relay configuration was not found.' }
New-Item -ItemType Directory -Force (Split-Path $portable) | Out-Null
Invoke-WebRequest -Uri $vendor -OutFile $installer
if ((Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'NV Access installer digest mismatch.' }
$install = Start-Process -FilePath $installer -ArgumentList @('--create-portable-silent', "--portable-path=`"$portable`"") -Wait -PassThru
if ($install.ExitCode -ne 0 -or -not (Test-Path "$portable/nvda.exe")) { throw "Portable build failed ($($install.ExitCode))." }
New-Item -ItemType Directory -Force "$portable/userConfig" | Out-Null
Copy-Item "$verifiedProfile/*" "$portable/userConfig/" -Recurse -Force
$nativeVersion = (Get-Item "$portable/nvda.exe").VersionInfo.ProductVersion
Write-Output "Official NV Access release $release, portable product version [$nativeVersion], verified SHA256 $expected."
"GUIDEPUP_SCREEN_READERS_PATH=$isolated" >> $env:GITHUB_ENV
"RGAA_NVDA_RELEASE=$release" >> $env:GITHUB_ENV
"RGAA_NVDA_NATIVE_VERSION=$nativeVersion" >> $env:GITHUB_ENV
