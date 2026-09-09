"""Tests for global FastAPI exception handlers (issue #43)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from lexflow.api.app import app


def test_unhandled_exception_returns_internal_error(client: TestClient) -> None:
    """Generic handler must not leak paths or stack traces."""
    route_path = "/api/v1/__test_unhandled_exception__"

    async def _raise() -> None:
        raise RuntimeError("secret /home/user/leak")

    app.add_api_route(route_path, _raise, methods=["GET"])
    try:
        # Handler returns 500 JSON; TestClient re-raises server exceptions by default.
        probe = TestClient(app, raise_server_exceptions=False, headers={"X-Lexflow-Client": "spa"})
        response = probe.get(route_path)
        assert response.status_code == 500
        body = response.json()
        assert body["code"] == "internal_error"
        assert "/home/user" not in body["detail"]
        assert "secret" not in body["detail"]
        assert "detail" in body
    finally:
        app.router.routes = [route for route in app.router.routes if getattr(route, "path", None) != route_path]


def test_law_not_found_still_uses_domain_handler(client: TestClient) -> None:
    """Domain handlers registered before the catch-all must still win."""
    response = client.get("/api/v1/laws/NONEXISTENT-123")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "law_not_found"
    assert "NONEXISTENT-123" in body["detail"]
