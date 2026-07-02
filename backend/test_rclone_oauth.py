import subprocess
import time

def test_rclone():
    print("Running rclone config create...")
    result = subprocess.run(
        ["rclone", "config", "create", "test_drive", "drive", "config_is_local", "true"],
        capture_output=True,
        text=True
    )
    print("Return code:", result.returncode)
    print("Stdout:", result.stdout)
    print("Stderr:", result.stderr)

if __name__ == "__main__":
    test_rclone()
