param(
    [ValidateSet('lab', 'notebook')]
    [string]$Mode = 'lab',

    [string]$EnvName = '',

    [string]$PythonPath = '',

    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$notebookRoot = Join-Path $projectRoot 'notebooks'
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'

# Fixed token — must match NEXT_PUBLIC_JUPYTER_TOKEN in frontend config
$token = 'NeuralSpace-dev-token'

if (-not (Test-Path -LiteralPath $notebookRoot)) {
    New-Item -ItemType Directory -Path $notebookRoot | Out-Null
}

# Common Jupyter flags shared by all launch modes
$commonFlags = @(
    "--ServerApp.root_dir=$notebookRoot",
    "--NotebookApp.notebook_dir=$notebookRoot",
    "--IdentityProvider.token=$token",
    "--ServerApp.token=$token",
    # CORS: allow the Next.js dev server to call the Jupyter REST API
    "--ServerApp.allow_origin=*",
    "--ServerApp.allow_credentials=True",
    "--ServerApp.allow_headers=*"
)

if ($EnvName) {
    $cmd = @('conda', 'run', '-n', $EnvName, 'python', '-m', 'jupyter', $Mode) + $commonFlags
}
else {
    $pythonExe = $PythonPath
    if (-not $pythonExe) {
        $pythonExe = $venvPython
    }

    if (-not (Test-Path -LiteralPath $pythonExe)) {
        throw "Python runtime not found. Pass -PythonPath <full-path-to-python.exe> or use -EnvName <conda-env>."
    }

    $cmd = @($pythonExe, '-m', 'jupyter', $Mode) + $commonFlags
}

Write-Host "Project root : $projectRoot"
Write-Host "Notebook root: $notebookRoot"
Write-Host "Token        : $token"
Write-Host "Starting     : $($cmd -join ' ')"

if (-not $WhatIf) {
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
}


