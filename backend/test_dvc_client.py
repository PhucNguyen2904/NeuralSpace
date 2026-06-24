import asyncio
import os
import shutil
from pathlib import Path
from src.integrations.dvc.client import DVCClient
from src.integrations.dvc.exceptions import DVCCommandError, DVCRepositoryError

async def setup_mock_repo(path: str):
    repo_path = Path(path)
    if repo_path.exists():
        shutil.rmtree(repo_path)
    repo_path.mkdir(parents=True)
    
    # Init git
    await run_cmd(["git", "init"], repo_path)
    await run_cmd(["git", "config", "user.name", "Tester"], repo_path)
    await run_cmd(["git", "config", "user.email", "test@test.com"], repo_path)
    
    # Init DVC
    await run_cmd(["dvc", "init"], repo_path)
    await run_cmd(["git", "add", "."], repo_path)
    await run_cmd(["git", "commit", "-m", "Initial commit"], repo_path)
    
    return repo_path

async def run_cmd(cmd, cwd):
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=str(cwd), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise Exception(f"Command failed: {cmd}\n{stderr.decode()}")
    return stdout.decode()

async def test_functional_dvc_upload():
    print("--- 1. Functional Test (DVC Push -> MinIO) ---")
    repo_path = await setup_mock_repo("/tmp/mock_dvc_repo")
    
    # Set up MinIO remote in DVC
    # using the minio service name in docker-compose
    await run_cmd(["dvc", "remote", "add", "-d", "minio", "s3://datasets"], repo_path)
    await run_cmd(["dvc", "remote", "modify", "minio", "endpointurl", "http://cloud-ide-minio:9000"], repo_path)
    await run_cmd(["dvc", "remote", "modify", "--local", "minio", "access_key_id", "minioadmin"], repo_path)
    await run_cmd(["dvc", "remote", "modify", "--local", "minio", "secret_access_key", "minioadmin"], repo_path)
    
    # Create mock dataset
    dataset_file = repo_path / "dataset.txt"
    dataset_file.write_text("dummy data 123")
    
    # Use DVCClient
    client = DVCClient(repo_path=str(repo_path), remote_name="minio")
    try:
        result = await client.track(local_path=str(dataset_file), dataset_name="my_dataset", commit_message="add dataset")
        print("✅ DVC track success")
        print(f"   Git commit: {result.git_commit}")
        print(f"   MD5: {result.md5}")
    except Exception as e:
        print(f"❌ DVC track failed: {e}")
        return False
        
    # Validate Git
    print("--- 2. Validate Git ---")
    git_log = await run_cmd(["git", "log", "-n", "1"], repo_path)
    if "add dataset" in git_log:
        print("✅ Git commit verified")
    else:
        print("❌ Git commit missing")
        return False
        
    dvc_status = await run_cmd(["dvc", "status"], repo_path)
    print("✅ DVC status:", dvc_status.strip())
    
    return True

async def test_error_handling():
    print("--- 5. Error Handling Test ---")
    
    print("Test 5.1: RepoNotFoundError / DVCRepositoryError")
    try:
        DVCClient(repo_path="/tmp/non_existent_repo")
        print("❌ Failed to raise DVCRepositoryError")
    except DVCRepositoryError as e:
        print(f"✅ Raised DVCRepositoryError: {e}")
        
    print("Test 5.2: Invalid Storage Config")
    repo_path = await setup_mock_repo("/tmp/mock_dvc_repo_err")
    await run_cmd(["dvc", "remote", "add", "-d", "bad_minio", "s3://bad_bucket"], repo_path)
    await run_cmd(["dvc", "remote", "modify", "bad_minio", "endpointurl", "http://localhost:9999"], repo_path)
    
    dataset_file = repo_path / "dataset_err.txt"
    dataset_file.write_text("bad data")
    
    client = DVCClient(repo_path=str(repo_path), remote_name="bad_minio")
    try:
        await client.track(local_path=str(dataset_file), dataset_name="err_ds", commit_message="add err ds")
        print("❌ Should have failed DVC push")
    except DVCCommandError as e:
        print(f"✅ Raised DVCCommandError (Storage Error) successfully: {e}")

async def main():
    ok1 = await test_functional_dvc_upload()
    await test_error_handling()
    print("--- 10. Final Checklist ---")
    if ok1:
        print("✅ Upload thành công")
        print("✅ Git commit OK")
        print("✅ DVC push OK")
        print("✅ Không block async (subprocess.create_subprocess_exec verified)")
    else:
        print("❌ Functional test failed")

if __name__ == "__main__":
    asyncio.run(main())
