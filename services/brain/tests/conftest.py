import pytest

from app import derived


@pytest.fixture(autouse=True)
def no_index_lag(monkeypatch):
    """Tests use exact dates; test_derived covers the lag on its own."""
    monkeypatch.setattr(derived, "INDEX_LAG_DAYS", 0)
