from fastapi.testclient import TestClient


def test_test_client_dependency_imports():
    assert TestClient is not None
