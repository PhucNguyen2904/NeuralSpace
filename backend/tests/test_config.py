"""Application settings tests."""

from app.config import Settings


def test_settings_ignore_retired_environment_keys() -> None:
    settings = Settings(KUBERNETES_IN_CLUSTER="false")

    assert settings.ENVIRONMENT == "development"
