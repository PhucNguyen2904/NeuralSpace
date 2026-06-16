# Upload Test Samples

## Model upload (PowerShell)

```powershell
$token = "<PASTE_AUTH_TOKEN>"
$filePath = "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\models\upload-smoke\model-v1.onnx"
$meta = Get-Content -LiteralPath "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\models\upload-smoke\model-upload-metadata.json" -Raw

curl.exe -X POST "http://localhost:8000/api/v1/models/upload" `
  -H "Authorization: Bearer $token" `
  -F "file=@$filePath" `
  -F "metadata=$meta"
```

## Model version upload (PowerShell)

```powershell
$token = "<PASTE_AUTH_TOKEN>"
$modelId = "<PASTE_MODEL_ID_FROM_UPLOAD_RESPONSE>"
$filePath = "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\models\upload-smoke\model-v2.onnx"
$meta = Get-Content -LiteralPath "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\models\upload-smoke\model-version-metadata.json" -Raw

curl.exe -X POST "http://localhost:8000/api/v1/models/$modelId/versions" `
  -H "Authorization: Bearer $token" `
  -F "file=@$filePath" `
  -F "metadata=$meta"
```

## Dataset upload (PowerShell)

```powershell
$token = "<PASTE_AUTH_TOKEN>"
$filePath = "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\datasets\sample-dataset.csv"
$meta = Get-Content -LiteralPath "D:\Documents\Lap_trinh\NeuralSpace\backend\test_samples\datasets\dataset-metadata.json" -Raw

curl.exe -X POST "http://localhost:8000/api/v1/datasets/upload" `
  -H "Authorization: Bearer $token" `
  -F "file=@$filePath" `
  -F "metadata=$meta"
```

## Notes
- Use a token from the login API (`access_token`).
- `upload-smoke/model-v1.onnx` and `upload-smoke/model-v2.onnx` are fake files for testing the upload/create-record pipeline.
- When testing a real model, replace them with an actual `.onnx/.pt/.pth/.h5/.safetensors` file.
