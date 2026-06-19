import time
from jose import jwt
import httpx
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


def _generate_jwt() -> str:
    """
    Tạo JWT để xác thực với GitHub App API.
    JWT có hiệu lực 10 phút — đủ dùng cho 1 API call.
    """
    settings = get_settings()
    now = int(time.time())
    payload = {
        "iat": now - 60,    # Trừ 60s để tránh clock skew
        "exp": now + 600,   # Hết hạn sau 10 phút
        "iss": settings.GITHUB_APP_ID,
    }
    return jwt.encode(
        payload,
        settings.GITHUB_APP_PRIVATE_KEY,
        algorithm="RS256",
    )


async def get_installation_access_token(installation_id: int) -> str:
    """
    Đổi installation_id → access token ngắn hạn (1 giờ).
    Dùng token này để gọi GitHub API thay mặt user.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {_generate_jwt()}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()["token"]


async def register_deploy_key(
    installation_id: int,
    owner: str,
    repo: str,
    public_key: str,
    key_title: str = "NeuralSpace Deploy Key",
) -> int:
    """
    Tự động đăng ký SSH public key vào GitHub repo Deploy Keys.

    Returns: deploy_key_id (dùng để xóa sau này nếu cần)
    """
    token = await get_installation_access_token(installation_id)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/keys",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            json={
                "title": key_title,
                "key": public_key,
                "read_only": False,     # Cần write để push
            },
        )
        resp.raise_for_status()
        return resp.json()["id"]


async def delete_deploy_key(
    installation_id: int,
    owner: str,
    repo: str,
    deploy_key_id: int,
) -> None:
    """Xóa Deploy Key khỏi GitHub khi profile bị xóa."""
    token = await get_installation_access_token(installation_id)

    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{GITHUB_API}/repos/{owner}/{repo}/keys/{deploy_key_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()


async def exchange_code_for_installation_id(code: str) -> int:
    """
    Sau OAuth callback, đổi code → access_token → installation_id.
    """
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        # Bước 1: Đổi code → user access token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={
                "client_id": settings.GITHUB_APP_CLIENT_ID,
                "client_secret": settings.GITHUB_APP_CLIENT_SECRET,
                "code": code,
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        if "access_token" not in token_data:
            logger.error(f"GitHub OAuth error response: {token_data}")
            raise ValueError(f"Could not get access token: {token_data.get('error_description', token_data)}")
        user_token = token_data["access_token"]

        # Bước 2: Lấy danh sách installations của user
        install_resp = await client.get(
            f"{GITHUB_API}/user/installations",
            headers={
                "Authorization": f"Bearer {user_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        install_resp.raise_for_status()
        installations = install_resp.json()["installations"]

        if not installations:
            raise ValueError(
                "Không tìm thấy GitHub App installation. "
                "Hãy cài GitHub App vào repo trước."
            )

        # Lấy installation đầu tiên (thường chỉ có 1)
        return installations[0]["id"]

class GitHubAppAuth:
    def __init__(self, installation_id: int):
        self.installation_id = installation_id

    @staticmethod
    def get_install_url(state: str) -> str:
        # Thay vì redirect thẳng đến trang cài đặt App, ta dùng OAuth authorize
        # để lấy token của user, từ đó kiểm tra xem họ đã cài App chưa.
        settings = get_settings()
        return f"https://github.com/login/oauth/authorize?client_id={settings.GITHUB_APP_CLIENT_ID}&state={state}"

    async def add_deploy_key(self, owner: str, repo: str, title: str, key: str) -> int:
        return await register_deploy_key(self.installation_id, owner, repo, key, title)

    async def remove_deploy_key(self, owner: str, repo: str, key_id: int) -> None:
        await delete_deploy_key(self.installation_id, owner, repo, key_id)
