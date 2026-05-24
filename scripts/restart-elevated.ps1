param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath,

  [Parameter(Mandatory = $true)]
  [string]$AppDir,

  [int]$DelaySeconds = 2
)

Start-Sleep -Seconds $DelaySeconds
Start-Process -FilePath $NodePath -ArgumentList "server.js" -WorkingDirectory $AppDir -WindowStyle Hidden
