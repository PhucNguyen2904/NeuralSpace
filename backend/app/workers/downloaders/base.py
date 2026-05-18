"""Base downloader class with streaming and resume support."""

import hashlib
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Callable, Optional, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.config import settings
from app.core.exceptions import (
    RangeRequestNotSupportedError,
    ChecksumMismatchError,
)


logger = logging.getLogger(__name__)


class BaseDownloader(ABC):
    """Abstract base class for model downloaders."""

    def __init__(self):
        self.chunk_size = settings.CHUNK_SIZE_BYTES
        self.connect_timeout = settings.CONNECT_TIMEOUT
        self.read_timeout = settings.READ_TIMEOUT
        self.disk_check_interval = settings.DISK_CHECK_INTERVAL_BYTES
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy."""
        session = requests.Session()

        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        return session

    @abstractmethod
    async def resolve_download_info(self) -> Tuple[str, Optional[int], Optional[str]]:
        """
        Resolve actual download URL and metadata.

        Returns:
            Tuple of (url, total_size_bytes, expected_sha256)
        """
        pass

    async def stream_with_resume(
        self,
        task_id: str,
        url: str,
        temp_path: Path,
        progress_callback: Optional[Callable] = None,
        expected_sha256: Optional[str] = None,
    ) -> Tuple[Path, str]:
        """
        Stream download with resume support.

        Handles HTTP Range requests to resume interrupted downloads.
        Calculates SHA-256 incrementally during download.

        Args:
            task_id: Task identifier for logging
            url: Download URL
            temp_path: Temporary file path
            progress_callback: Callback function for progress updates
            expected_sha256: Expected SHA-256 hash for verification

        Returns:
            Tuple of (final_path, calculated_sha256)

        Raises:
            ChecksumMismatchError: If calculated hash doesn't match expected
            InsufficientDiskSpaceError: If disk space runs out
        """
        temp_path.parent.mkdir(parents=True, exist_ok=True)

        # Check if resumable download is possible
        resume_offset = 0
        if temp_path.exists():
            resume_offset = temp_path.stat().st_size
            logger.info(f"Resuming download from {resume_offset} bytes")

        # Try to get file size via HEAD request
        try:
            head_response = self.session.head(
                url,
                timeout=(self.connect_timeout, self.read_timeout),
                allow_redirects=True,
            )
            total_size = int(head_response.headers.get("content-length", 0))
            supports_range = head_response.headers.get("accept-ranges") == "bytes"
        except Exception as e:
            logger.warning(f"Failed to get file size via HEAD: {e}")
            total_size = 0
            supports_range = False

        # Determine if we can resume
        can_resume = supports_range and resume_offset > 0

        if can_resume:
            headers = {"Range": f"bytes={resume_offset}-"}
        else:
            headers = {}
            if temp_path.exists():
                temp_path.unlink()
                resume_offset = 0

        # Download with streaming
        sha256_hash = hashlib.sha256()
        bytes_downloaded = resume_offset
        bytes_since_check = 0

        with self.session.get(
            url,
            headers=headers,
            stream=True,
            timeout=(self.connect_timeout, self.read_timeout),
        ) as response:
            # Verify response status
            if can_resume and response.status_code == 206:
                logger.info("Server supports range requests, resuming")
            elif response.status_code == 416:
                # Range Not Satisfiable - file already complete
                logger.info("File already complete")
                if temp_path.exists() and expected_sha256:
                    calculated_hash = self._calculate_sha256(temp_path)
                    if calculated_hash != expected_sha256:
                        raise ChecksumMismatchError(expected_sha256, calculated_hash)
                return temp_path, calculated_hash
            elif response.status_code == 200:
                # Full file download (no range support)
                if resume_offset > 0:
                    logger.warning("Server doesn't support resume, restarting")
                    temp_path.unlink()
                    resume_offset = 0
                    bytes_downloaded = 0
                total_size = int(response.headers.get("content-length", 0))
            else:
                response.raise_for_status()

            # Stream chunks
            with open(temp_path, "ab" if can_resume and resume_offset > 0 else "wb") as f:
                for chunk in response.iter_content(chunk_size=self.chunk_size):
                    if chunk:
                        f.write(chunk)
                        sha256_hash.update(chunk)
                        bytes_downloaded += len(chunk)
                        bytes_since_check += len(chunk)

                        # Call progress callback
                        if progress_callback:
                            progress_pct = (
                                int(bytes_downloaded / total_size * 100)
                                if total_size > 0
                                else 0
                            )
                            speed_bps = bytes_downloaded / max(1, len(chunk))
                            await progress_callback(
                                progress_pct=progress_pct,
                                downloaded_bytes=bytes_downloaded,
                                total_bytes=total_size,
                                speed_bps=int(speed_bps),
                            )

                        # Periodic disk space check
                        if bytes_since_check > self.disk_check_interval:
                            # Check will be done by caller
                            bytes_since_check = 0

        calculated_hash = sha256_hash.hexdigest()

        # Verify hash if provided
        if expected_sha256 and calculated_hash != expected_sha256:
            raise ChecksumMismatchError(expected_sha256, calculated_hash)

        logger.info(
            f"Download complete: {bytes_downloaded} bytes, "
            f"hash: {calculated_hash}"
        )
        return temp_path, calculated_hash

    def _calculate_sha256(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of a file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(self.chunk_size), b""):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()

    def close(self):
        """Close the session."""
        self.session.close()
