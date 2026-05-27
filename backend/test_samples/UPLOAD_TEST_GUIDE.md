# Upload Test Samples

## Model upload (PowerShell)

```powershell
$token = "<PASTE_AUTH_TOKEN>"
$filePath = "D:\Documents\Lap trinh\CollabClone\backend\test_samples\models\sample-model.onnx"
$meta = Get-Content -LiteralPath "D:\Documents\Lap trinh\CollabClone\backend\test_samples\models\model-metadata.json" -Raw

curl.exe -X POST "http://localhost:8000/api/v1/models/upload" `
  -H "Authorization: Bearer $token" `
  -F "file=@$filePath" `
  -F "metadata=$meta"
```

## Dataset upload (PowerShell)

```powershell
$token = "<PASTE_AUTH_TOKEN>"
$filePath = "D:\Documents\Lap trinh\CollabClone\backend\test_samples\datasets\sample-dataset.csv"
$meta = Get-Content -LiteralPath "D:\Documents\Lap trinh\CollabClone\backend\test_samples\datasets\dataset-metadata.json" -Raw

curl.exe -X POST "http://localhost:8000/api/v1/datasets/upload" `
  -H "Authorization: Bearer $token" `
  -F "file=@$filePath" `
  -F "metadata=$meta"
```

## Notes
- Dùng token lấy từ login API (`access_token`).
- `sample-model.onnx` là file giả để test pipeline upload/create record.
- Khi test model thật, thay bằng file `.onnx/.pt/.pth/.h5/.safetensors` thực tế.
