import os
import subprocess
import tempfile
from contextlib import contextmanager
from cryptography.fernet import Fernet
from app.config import get_settings


def get_cipher() -> Fernet:
    return Fernet(get_settings().SSH_KEY_ENCRYPTION_KEY.encode())


def encrypt_private_key(raw: str) -> bytes:
    return get_cipher().encrypt(raw.encode())


def decrypt_private_key(encrypted: bytes) -> str:
    return get_cipher().decrypt(encrypted).decode()


def generate_deploy_keypair(label: str) -> tuple[str, bytes]:
    """
    Tạo SSH ed25519 keypair sử dụng thư viện cryptography.

    Returns:
        public_key        (str)   → Đăng ký lên GitHub qua API
        encrypted_private (bytes) → Lưu vào DB
    """
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization

    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption()
    )

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH
    )

    public_key_str = public_bytes.decode('utf-8').strip() + f" neuralspace-{label}"
    private_key_str = private_bytes.decode('utf-8')

    return public_key_str, encrypt_private_key(private_key_str)


@contextmanager
def temp_ssh_key_file(encrypted: bytes):
    """
    Context manager: decrypt → ghi /tmp → yield path → xóa ngay.

    Dùng:
        with temp_ssh_key_file(profile.ssh_key_encrypted) as key_path:
            env = {"GIT_SSH_COMMAND": f"ssh -i {key_path} ..."}
            subprocess.run(["git", "push", ...], env=env)
        # File đã bị xóa
    """
    content = decrypt_private_key(encrypted)
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".pem", delete=False, dir="/tmp"
    )
    try:
        tmp.write(content)
        tmp.flush()
        tmp.close()
        os.chmod(tmp.name, 0o600)   # SSH từ chối key nếu permission > 600
        yield tmp.name
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)

def generate_ssh_keypair() -> tuple[bytes, str]:
    import uuid
    label = str(uuid.uuid4())[:8]
    public_key, encrypted = generate_deploy_keypair(label)
    return encrypted, public_key
