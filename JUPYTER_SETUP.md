# Jupyter Workspace Convention

- Canonical notebook folder: `D:\Documents\Lap trinh\CollabClone\notebooks`
- Start script: `scripts/start-jupyter.ps1`
- Registered kernel: `Python (collabclone)`

## Usage

- JupyterLab:
  `powershell -ExecutionPolicy Bypass -File .\scripts\start-jupyter.ps1`

- Classic Notebook:
  `powershell -ExecutionPolicy Bypass -File .\scripts\start-jupyter.ps1 -Mode notebook`

- With explicit Python runtime:
  `powershell -ExecutionPolicy Bypass -File .\scripts\start-jupyter.ps1 -PythonPath "D:\Documents\Lap trinh\CollabClone\.venv\Scripts\python.exe"`

- With conda env activation:
  `powershell -ExecutionPolicy Bypass -File .\scripts\start-jupyter.ps1 -EnvName <your-env>`

- Dry run:
  `powershell -ExecutionPolicy Bypass -File .\scripts\start-jupyter.ps1 -WhatIf`

## If kernel is not auto-selected

- In UI: `Kernel` -> `Change Kernel` -> choose `Python (collabclone)`.
