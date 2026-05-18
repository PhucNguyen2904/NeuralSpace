"""HuggingFace model downloader."""

import logging
from typing import Optional, Tuple
from huggingface_hub import HfApi, repo_type_and_id_from_hf_id

from app.config import settings
from app.workers.downloaders.base import BaseDownloader


logger = logging.getLogger(__name__)


class HuggingFaceDownloader(BaseDownloader):
    """Downloader for HuggingFace models."""

    def __init__(self, hf_token: Optional[str] = None):
        super().__init__()
        self.hf_token = hf_token or settings.HF_DEFAULT_TOKEN
        self.api = HfApi()

    async def resolve_download_info(
        self,
        repo_id: str,
        revision: str = "main",
        file_patterns: Optional[list[str]] = None,
    ) -> list[Tuple[str, Optional[int], Optional[str]]]:
        """
        Resolve HuggingFace model files to download.

        Args:
            repo_id: Repository ID (e.g., "mistralai/Mistral-7B-v0.1")
            revision: Git revision (branch, tag, or commit)
            file_patterns: List of glob patterns to match files (None = all files)

        Returns:
            List of tuples (url, size, sha256) for each file to download
        """
        try:
            repo_info = self.api.repo_info(
                repo_id=repo_id,
                revision=revision,
                token=self.hf_token,
            )
        except Exception as e:
            logger.error(f"Failed to get HuggingFace repo info: {e}")
            raise

        # Get list of files
        files = []
        for sibling in repo_info.siblings:
            # Match file patterns if provided
            if file_patterns:
                import fnmatch
                if not any(fnmatch.fnmatch(sibling.rfilename, p) for p in file_patterns):
                    continue

            # Construct download URL
            url = f"https://huggingface.co/{repo_id}/resolve/{revision}/{sibling.rfilename}"

            files.append((
                url,
                sibling.size,
                sibling.blob_id[:8] if sibling.blob_id else None,
            ))

        logger.info(f"Resolved {len(files)} files from {repo_id}")
        return files

    async def get_single_file_url(
        self,
        repo_id: str,
        filename: str,
        revision: str = "main",
    ) -> Tuple[str, Optional[int], Optional[str]]:
        """Get URL for a single file."""
        try:
            url = self.api.hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                revision=revision,
                token=self.hf_token,
                local_dir=None,  # Don't download, just get URL
            )
            return url, None, None
        except Exception as e:
            logger.error(f"Failed to get HuggingFace file URL: {e}")
            raise
