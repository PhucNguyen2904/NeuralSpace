"""GitHub Release downloader."""

import logging
import re
from typing import Optional, Tuple, List
import requests
from fnmatch import fnmatch

from app.workers.downloaders.base import BaseDownloader


logger = logging.getLogger(__name__)


class GitHubReleaseDownloader(BaseDownloader):
    """Downloader for GitHub Release assets."""

    GITHUB_API_BASE = "https://api.github.com"

    async def resolve_download_info(
        self,
        owner: str,
        repo: str,
        tag: str,
        file_patterns: Optional[List[str]] = None,
    ) -> List[Tuple[str, Optional[int], Optional[str]]]:
        """
        Resolve GitHub Release assets to download.

        Args:
            owner: Repository owner
            repo: Repository name
            tag: Release tag
            file_patterns: List of glob patterns to match files (None = all files)

        Returns:
            List of tuples (url, size, sha256) for each asset
        """
        try:
            # Get release info
            url = f"{self.GITHUB_API_BASE}/repos/{owner}/{repo}/releases/tags/{tag}"
            response = self.session.get(url, timeout=(self.connect_timeout, self.read_timeout))
            response.raise_for_status()
            release = response.json()

            files = []
            for asset in release.get("assets", []):
                filename = asset["name"]

                # Match file patterns if provided
                if file_patterns:
                    if not any(fnmatch(filename, p) for p in file_patterns):
                        continue

                files.append((
                    asset["browser_download_url"],
                    asset.get("size"),
                    None,  # GitHub doesn't provide SHA256 in API
                ))

            logger.info(f"Resolved {len(files)} assets from {owner}/{repo}@{tag}")
            return files

        except requests.RequestException as e:
            logger.error(f"Failed to get GitHub release: {e}")
            raise

    async def resolve_from_identifier(
        self,
        identifier: str,
        file_patterns: Optional[List[str]] = None,
    ) -> List[Tuple[str, Optional[int], Optional[str]]]:
        """
        Resolve from a GitHub identifier string.

        Format: owner/repo/tag

        Args:
            identifier: GitHub identifier string
            file_patterns: List of glob patterns

        Returns:
            List of download file info
        """
        parts = identifier.split("/")
        if len(parts) < 3:
            raise ValueError(
                f"Invalid GitHub identifier: {identifier}. "
                "Expected format: owner/repo/tag"
            )

        owner, repo, tag = parts[0], parts[1], parts[2]
        return await self.resolve_download_info(owner, repo, tag, file_patterns)
