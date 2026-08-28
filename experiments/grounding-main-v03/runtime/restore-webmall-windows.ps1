param(
  [string]$WebMallRoot = "",
  [switch]$SkipRestore
)

$ErrorActionPreference = "Stop"
if (-not $WebMallRoot) {
  $WebMallRoot = Join-Path $PSScriptRoot "..\vendor\webmall"
}
$WebMallRoot = (Resolve-Path -LiteralPath $WebMallRoot).Path
$DockerRoot = Join-Path $WebMallRoot "docker_all"
$BackupRoot = Join-Path $DockerRoot "backup"
$ConfigRoot = Join-Path $DockerRoot "deployed_wp_config_local"
$ComposePath = Join-Path $DockerRoot "docker-compose.yml"
$ComposeOverridePath = Join-Path $PSScriptRoot "webmall.compose.override.yaml"
$EnvPath = Join-Path $WebMallRoot ".env"
$RuntimeConfigRoot = Join-Path $PSScriptRoot "..\.runs\runtime\webmall-config"

$requiredBackups = 1..4 | ForEach-Object {
  @(
    "mariadb_data_shop$_.tar.gz",
    "wordpress_data_shop$_.tar.gz"
  )
}
foreach ($file in $requiredBackups) {
  $path = Join-Path $BackupRoot $file
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing WebMall backup: $path"
  }
}
if (-not (Test-Path -LiteralPath $EnvPath)) {
  throw "Missing WebMall environment file: $EnvPath"
}

New-Item -ItemType Directory -Path $RuntimeConfigRoot -Force | Out-Null
$environment = @{}
foreach ($line in Get-Content -LiteralPath $EnvPath) {
  if ($line -match '^([A-Za-z0-9_]+)=(.*)$') {
    $environment[$Matches[1]] = $Matches[2].Trim('"')
  }
}

if (-not $SkipRestore) {
docker compose --env-file $EnvPath -f $ComposePath -f $ComposeOverridePath down
if ($LASTEXITCODE -ne 0) { throw "Could not stop WebMall before restore" }
for ($shop = 1; $shop -le 4; $shop += 1) {
  $wordpressVolume = "woocommerce_wordpress_data_shop$shop"
  $mariadbVolume = "woocommerce_mariadb_data_shop$shop"
  foreach ($volume in @($wordpressVolume, $mariadbVolume)) {
    docker volume inspect $volume *> $null
    if ($LASTEXITCODE -eq 0) {
      docker volume rm $volume | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Could not remove WebMall volume $volume" }
    }
  }
  docker volume create --label ugp.experiment=grounding-main-v03 $wordpressVolume | Out-Null
  docker volume create --label ugp.experiment=grounding-main-v03 $mariadbVolume | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create WebMall volumes" }

  docker run --rm `
    -v "${wordpressVolume}:/volume" `
    -v "${BackupRoot}:/backup" `
    busybox:latest `
    tar xzf "/backup/wordpress_data_shop$shop.tar.gz" -C /volume
  if ($LASTEXITCODE -ne 0) { throw "WordPress restore failed for shop $shop" }

  $port = $environment["SHOP${shop}_PORT"]
  if (-not $port) { throw "SHOP${shop}_PORT is missing" }
  $template = Get-Content -LiteralPath (Join-Path $ConfigRoot "shop_$shop.php") -Raw
  $configPath = Join-Path $RuntimeConfigRoot "shop_$shop.php"
  $template.Replace("SHOP${shop}_PORT_PLACEHOLDER", $port) |
    Set-Content -LiteralPath $configPath -NoNewline
  docker run --rm `
    -v "${wordpressVolume}:/volume" `
    -v "${RuntimeConfigRoot}:/temp_config:ro" `
    busybox:latest `
    cp "/temp_config/shop_$shop.php" /volume/wp-config.php
  if ($LASTEXITCODE -ne 0) { throw "wp-config restore failed for shop $shop" }

  docker run --rm `
    -v "${mariadbVolume}:/volume" `
    -v "${BackupRoot}:/backup" `
    busybox:latest `
    tar xzf "/backup/mariadb_data_shop$shop.tar.gz" -C /volume
  if ($LASTEXITCODE -ne 0) { throw "MariaDB restore failed for shop $shop" }
}
}

docker compose --env-file $EnvPath -f $ComposePath -f $ComposeOverridePath up -d
if ($LASTEXITCODE -ne 0) { throw "WebMall compose startup failed" }

for ($shop = 1; $shop -le 4; $shop += 1) {
  $container = "WebMall_wordpress_shop$shop"
  $port = $environment["SHOP${shop}_PORT"]
  $sourceUrl = "https://webmall-$shop.informatik.uni-mannheim.de/"
  $targetUrl = "http://localhost:$port"
  $fixed = $false
  for ($attempt = 1; $attempt -le 60; $attempt += 1) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    docker exec $container /bin/bash -c "tr -d '\r' < /usr/local/bin/fix_urls_deploy.sh > /tmp/fix_urls_deploy.sh && /bin/bash /tmp/fix_urls_deploy.sh '$sourceUrl' '$targetUrl'" *> $null
    $rewriteExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($rewriteExitCode -eq 0) {
      $fixed = $true
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $fixed) { throw "URL rewrite failed for WebMall shop $shop" }
}

docker compose --env-file $EnvPath -f $ComposePath -f $ComposeOverridePath restart
if ($LASTEXITCODE -ne 0) { throw "WebMall restart failed" }
docker compose --env-file $EnvPath -f $ComposePath -f $ComposeOverridePath ps
