"""Downloaders package."""

from app.workers.downloaders.base import BaseDownloader
from app.workers.downloaders.huggingface import HuggingFaceDownloader
from app.workers.downloaders.direct_url import DirectURLDownloader
from app.workers.downloaders.github import GitHubReleaseDownloader


def get_downloader(source_type: str, **kwargs) -> BaseDownloader:
    """Factory function to get appropriate downloader."""
    if source_type == "huggingface":
        return HuggingFaceDownloader(**kwargs)
    elif source_type == "direct_url":
        return DirectURLDownloader(**kwargs)
    elif source_type == "github_release":
        return GitHubReleaseDownloader(**kwargs)
    else:
        raise ValueError(f"Unknown source type: {source_type}")


__all__ = [
    "BaseDownloader",
    "HuggingFaceDownloader",
    "DirectURLDownloader",
    "GitHubReleaseDownloader",
    "get_downloader",
]
