from __future__ import annotations

import asyncio
import base64
import io
import sys
import threading
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import (
    MAX_REQUEST_BODY_BYTES,
    Settings,
    _run_inference_serialized,
    create_app,
)


class FakeResult:
    def __init__(self, payload: Any) -> None:
        self.json = payload


class FakeModel:
    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.calls: list[tuple[tuple[int, ...], int]] = []

    def predict(
        self,
        *,
        input: np.ndarray[Any, Any],
        batch_size: int,
    ) -> Iterable[FakeResult]:
        self.calls.append((input.shape, batch_size))
        return [FakeResult(self.payload)]


class BlockingModel:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.guard = threading.Lock()
        self.active = 0
        self.maximum_active = 0

    def predict(
        self,
        *,
        input: np.ndarray[Any, Any],
        batch_size: int,
    ) -> Iterable[FakeResult]:
        del input, batch_size
        with self.guard:
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
        self.started.set()
        if not self.release.wait(timeout=5):
            raise RuntimeError("Blocking test model timed out.")
        with self.guard:
            self.active -= 1
        return [FakeResult({"res": {"rec_formula": "x"}})]


def png_base64(width: int = 32, height: int = 16) -> str:
    image = Image.new("RGB", (width, height), color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    image.close()
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def configured_client(
    model: FakeModel,
    *,
    api_token: str = "test-token",
) -> TestClient:
    settings = Settings(
        model_name="PP-FormulaNet-S",
        device="cpu",
        engine="paddle_static",
        api_token=api_token,
    )
    application = create_app(
        settings=settings,
        model_factory=lambda _: model,
    )
    return TestClient(application)


def test_health_readiness_and_success_contract() -> None:
    model = FakeModel({"res": {"rec_formula": r"\frac{x+1}{x-1}"}})

    with configured_client(model) as client:
        health = client.get("/healthz")
        assert health.status_code == 200
        assert health.json() == {
            "service": "tutorboard-paddle-formula-sidecar",
            "status": "ok",
            "version": "1.0.1",
        }

        readiness = client.get("/readyz")
        assert readiness.status_code == 200
        assert readiness.json() == {
            "device": "cpu",
            "engine": "paddle_static",
            "model": "PP-FormulaNet-S",
            "service": "tutorboard-paddle-formula-sidecar",
            "status": "ready",
            "version": "1.0.1",
        }

        response = client.post(
            "/v1/recognize",
            headers={
                "Authorization": "Bearer test-token",
                "X-TutorBoard-Request-Id": "recognition:test",
            },
            json={
                "imageBase64": png_base64(),
                "mimeType": "image/png",
            },
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-tutorboard-request-id"] == "recognition:test"
    assert response.json() == {
        "latex": r"\frac{x+1}{x-1}",
        "modelVersion": "PP-FormulaNet-S/paddleocr-unknown",
        "requestId": "recognition:test",
    }
    assert model.calls == [((16, 32, 3), 1)]


def test_rejects_missing_or_invalid_bearer_token() -> None:
    model = FakeModel({"res": {"rec_formula": "x"}})

    with configured_client(model) as client:
        missing = client.post(
            "/v1/recognize",
            json={"imageBase64": png_base64(), "mimeType": "image/png"},
        )
        invalid = client.post(
            "/v1/recognize",
            headers={"Authorization": "Bearer wrong"},
            json={"imageBase64": png_base64(), "mimeType": "image/png"},
        )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert model.calls == []


def test_rejects_oversized_request_before_json_parsing() -> None:
    model = FakeModel({"res": {"rec_formula": "x"}})

    with configured_client(model, api_token="") as client:
        response = client.post(
            "/v1/recognize",
            content=b"x" * (MAX_REQUEST_BODY_BYTES + 1),
            headers={"Content-Type": "application/json"},
        )

    assert response.status_code == 413
    assert response.json() == {
        "detail": "Formula recognition request exceeds the sidecar limit."
    }
    assert model.calls == []


def test_cancelled_request_keeps_paddle_inference_serialized() -> None:
    model = BlockingModel()
    image = Image.new("RGB", (8, 8), color="white")

    async def scenario() -> None:
        lock = asyncio.Lock()
        first = asyncio.create_task(_run_inference_serialized(lock, model, image))
        started = await asyncio.to_thread(model.started.wait, 1)
        assert started is True

        first.cancel()
        second = asyncio.create_task(_run_inference_serialized(lock, model, image))
        await asyncio.sleep(0.05)

        assert model.maximum_active == 1
        assert second.done() is False

        model.release.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert await second == "x"
        assert model.maximum_active == 1

    try:
        asyncio.run(scenario())
    finally:
        image.close()


@pytest.mark.parametrize(
    ("body", "expected_status"),
    [
        (
            {"imageBase64": "not-base64", "mimeType": "image/png"},
            422,
        ),
        (
            {
                "imageBase64": base64.b64encode(b"plain text").decode("ascii"),
                "mimeType": "image/png",
            },
            422,
        ),
        (
            {
                "imageBase64": png_base64(width=769, height=1),
                "mimeType": "image/png",
            },
            413,
        ),
        (
            {
                "imageBase64": png_base64(),
                "mimeType": "image/jpeg",
            },
            422,
        ),
    ],
)
def test_rejects_invalid_or_oversized_images(
    body: dict[str, str],
    expected_status: int,
) -> None:
    model = FakeModel({"res": {"rec_formula": "x"}})

    with configured_client(model, api_token="") as client:
        response = client.post("/v1/recognize", json=body)

    assert response.status_code == expected_status
    assert model.calls == []


def test_rejects_unknown_request_properties() -> None:
    model = FakeModel({"res": {"rec_formula": "x"}})

    with configured_client(model, api_token="") as client:
        response = client.post(
            "/v1/recognize",
            json={
                "extra": True,
                "imageBase64": png_base64(),
                "mimeType": "image/png",
            },
        )

    assert response.status_code == 422
    assert model.calls == []


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"res": {}},
        {"res": {"rec_formula": ""}},
        {"res": {"rec_formula": "x" * 4097}},
    ],
)
def test_maps_invalid_model_results_to_bounded_failure(payload: Any) -> None:
    model = FakeModel(payload)

    with configured_client(model, api_token="") as client:
        response = client.post(
            "/v1/recognize",
            json={"imageBase64": png_base64(), "mimeType": "image/png"},
        )

    assert response.status_code == 502
    assert response.json() == {"detail": "PaddleOCR formula recognition failed."}


def test_settings_validate_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PADDLE_FORMULA_DEVICE", "gpu:0")
    monkeypatch.setenv("PADDLE_FORMULA_CPU_THREADS", "6")
    monkeypatch.setenv("PADDLE_FORMULA_ENABLE_HPI", "true")
    monkeypatch.setenv("PADDLE_FORMULA_PRECISION", "fp16")

    settings = Settings.from_environment()

    assert settings.device == "gpu:0"
    assert settings.cpu_threads == 6
    assert settings.enable_hpi is True
    assert settings.precision == "fp16"


def test_settings_reject_ambiguous_boolean(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PADDLE_FORMULA_ENABLE_HPI", "perhaps")

    with pytest.raises(RuntimeError, match="PADDLE_FORMULA_ENABLE_HPI"):
        Settings.from_environment()
