import httpx
import logging

logger = logging.getLogger(__name__)


async def get_ngrok_public_url() -> str | None:
    """
    Gọi ngrok local API để lấy HTTPS public URL hiện tại.
    
    Chỉ dùng trong môi trường development.
    ngrok dashboard API chạy tại http://ngrok:4040
    ("ngrok" là tên service trong docker-compose network)
    
    Returns:
        str  → HTTPS public URL, ví dụ: https://abc123.ngrok.io
        None → Nếu ngrok chưa sẵn sàng hoặc lỗi
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("http://ngrok:4040/api/tunnels")
            resp.raise_for_status()

            tunnels = resp.json().get("tunnels", [])

            # Ưu tiên HTTPS tunnel
            https_tunnel = next(
                (t for t in tunnels if t.get("proto") == "https"),
                None,
            )

            if https_tunnel:
                return https_tunnel["public_url"]

            logger.warning("ngrok: Không tìm thấy HTTPS tunnel")
            return None

    except httpx.ConnectError:
        logger.warning("ngrok: Chưa sẵn sàng hoặc chưa chạy")
        return None
    except Exception as e:
        logger.error(f"ngrok: Lỗi khi lấy public URL: {e}")
        return None
