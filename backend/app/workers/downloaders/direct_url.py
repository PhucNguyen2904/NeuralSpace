"""Direct URL downloader."""

import logging
from typing import Optional, Tuple
import requests

from app.workers.downloaders.base import BaseDownloader


logger = logging.getLogger(__name__)


class DirectURLDownloader(BaseDownloader):
    """Downloader for direct HTTP(S) URLs."""

    async def resolve_download_info(self, url: str) -> Tuple[str, Optional[int], Optional[str]]:
        """
        Resolve file info from a direct URL.

        Args:
            url: Direct HTTP(S) URL

        Returns:
            Tuple of (url, total_size, expected_sha256)
        """
        try:
            response = self.session.head(url, allow_redirects=True)
            response.raise_for_status()

            size = int(response.headers.get("content-length", 0))
            # Try to get hash from headers if available
            sha256 = response.headers.get("x-checksum-sha256")

            logger.info(f"Resolved URL: {url}, size: {size}")
            return url, size, sha256

        except requests.RequestException as e:
            logger.error(f"Failed to resolve URL: {e}")
            raise
