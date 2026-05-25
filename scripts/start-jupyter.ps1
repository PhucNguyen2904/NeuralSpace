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

if (-not (Test-Path -LiteralPath $notebookRoot)) {
    New-Item -ItemType Directory -Path $notebookRoot | Out-Null
}

if ($EnvName) {
    $cmd = @(
        'conda', 'run', '-n', $EnvName,
        'python', '-m', 'jupyter', $Mode,
        "--ServerApp.root_dir=$notebookRoot",
        "--NotebookApp.notebook_dir=$notebookRoot"
    )
}
else {
    $pythonExe = $PythonPath
    if (-not $pythonExe) {
        $pythonExe = $venvPython
    }

    if (-not (Test-Path -LiteralPath $pythonExe)) {
        throw "Python runtime not found. Pass -PythonPath <full-path-to-python.exe> or use -EnvName <conda-env>."
    }

    $cmd = @(
        $pythonExe, '-m', 'jupyter', $Mode,
        "--ServerApp.root_dir=$notebookRoot",
        "--NotebookApp.notebook_dir=$notebookRoot"
    )
}

Write-Host "Project root : $projectRoot"
Write-Host "Notebook root: $notebookRoot"
Write-Host "Starting     : $($cmd -join ' ')"

if (-not $WhatIf) {
    & $cmd[0] $cmd[1..($cmd.Length - 1)]
}
