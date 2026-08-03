from __future__ import annotations

import asyncio
import base64
import binascii
import io
import json
import logging
import os
import re
import secrets
import time
from collections.abc import Callable, Iterable, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from typing import Annotated, Any, Protocol, cast

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

SERVICE_NAME = "tutorboard-paddle-formula-sidecar"
SERVICE_VERSION = "1.0.0"
DEFAULT_MODEL_NAME = "PP-FormulaNet-S"
DEFAULT_DEVICE = "cpu"
DEFAULT_ENGINE = "paddle_static"
MAX_IMAGE_BYTES = 768 * 1024
MAX_BASE64_CHARACTERS = 1024 * 1024
MAX_IMAGE_SIDE = 768
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9:._-]{1,256}$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_SIDE * MAX_IMAGE_SIDE * 2

logger = logging.getLogger(SERVICE_NAME)


class FormulaResult(Protocol):
    @property
    def json(self) -> Any: ...


class FormulaModel(Protocol):
    def predict(
        self,
        *,
        input: np.ndarray[Any, Any],
        batch_size: int,
    ) -> Iterable[FormulaResult]: ...


ModelFactory = Callable[["Settings"], FormulaModel]


@dataclass(frozen=True, slots=True)
class Settings:
    model_name: str = DEFAULT_MODEL_NAME
    model_dir: str | None = None
    device: str = DEFAULT_DEVICE
    engine: str = DEFAULT_ENGINE
    api_token: str = ""
    cpu_threads: int = 8
    enable_hpi: bool = False
    enable_mkldnn: bool = True
    use_tensorrt: bool = False
    precision: str = "fp32"

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            model_name=_bounded_environment(
                "PADDLE_FORMULA_MODEL",
                DEFAULT_MODEL_NAME,
                maximum_length=128,
            ),
            model_dir=_optional_environment(
                "PADDLE_FORMULA_MODEL_DIR",
                maximum_length=1024,
            ),
            device=_bounded_environment(
                "PADDLE_FORMULA_DEVICE",
                DEFAULT_DEVICE,
                maximum_length=64,
            ),
            engine=_bounded_environment(
                "PADDLE_FORMULA_ENGINE",
                DEFAULT_ENGINE,
                maximum_length=64,
            ),
            api_token=_optional_environment(
                "PADDLE_FORMULA_API_TOKEN",
                maximum_length=512,
            )
            or "",
            cpu_threads=_integer_environment(
                "PADDLE_FORMULA_CPU_THREADS",
                default=8,
                minimum=1,
                maximum=64,
            ),
            enable_hpi=_boolean_environment(
                "PADDLE_FORMULA_ENABLE_HPI",
                default=False,
            ),
            enable_mkldnn=_boolean_environment(
                "PADDLE_FORMULA_ENABLE_MKLDNN",
                default=True,
            ),
            use_tensorrt=_boolean_environment(
                "PADDLE_FORMULA_USE_TENSORRT",
                default=False,
            ),
            precision=_choice_environment(
                "PADDLE_FORMULA_PRECISION",
                default="fp32",
                allowed={"fp16", "fp32"},
            ),
        )


class RecognitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    imageBase64: str = Field(min_length=4, max_length=MAX_BASE64_CHARACTERS)
    mimeType: str = Field(pattern=r"^image/png$")


class RecognitionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latex: str
    modelVersion: str
    requestId: str


def _optional_environment(name: str, maximum_length: int) -> str | None:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return None
    if len(raw) > maximum_length:
        raise RuntimeError(f"{name} exceeds {maximum_length} characters.")
    return raw


def _bounded_environment(name: str, default: str, maximum_length: int) -> str:
    value = _optional_environment(name, maximum_length)
    return default if value is None else value


def _integer_environment(
    name: str,
    *,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error
    if value < minimum or value > maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _boolean_environment(name: str, *, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true"}:
        return True
    if normalized in {"0", "false"}:
        return False
    raise RuntimeError(f"{name} must be true, false, 1 or 0.")


def _choice_environment(name: str, *, default: str, allowed: set[str]) -> str:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    normalized = raw.strip().lower()
    if normalized not in allowed:
        choices = ", ".join(sorted(allowed))
        raise RuntimeError(f"{name} must be one of: {choices}.")
    return normalized


def _package_version(package_name: str) -> str:
    try:
        return version(package_name)
    except PackageNotFoundError:
        return "unknown"


def _default_model_factory(settings: Settings) -> FormulaModel:
    from paddleocr import FormulaRecognition

    options: dict[str, Any] = {
        "model_name": settings.model_name,
        "device": settings.device,
        "engine": settings.engine,
        "enable_hpi": settings.enable_hpi,
        "enable_mkldnn": settings.enable_mkldnn,
        "cpu_threads": settings.cpu_threads,
        "use_tensorrt": settings.use_tensorrt,
    }
    if settings.model_dir is not None:
        options["model_dir"] = settings.model_dir
    if settings.use_tensorrt:
        options["precision"] = settings.precision
    return cast(FormulaModel, FormulaRecognition(**options))


def _authorize(settings: Settings, authorization: str | None) -> None:
    if settings.api_token == "":
        return
    expected = f"Bearer {settings.api_token}"
    if authorization is None or not secrets.compare_digest(
        authorization,
        expected,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid Paddle formula sidecar token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _request_id(value: str | None) -> str:
    if value is not None and REQUEST_ID_PATTERN.fullmatch(value) is not None:
        return value
    return f"paddle:{secrets.token_hex(16)}"


def _decode_image(payload: RecognitionRequest) -> Image.Image:
    try:
        raw = base64.b64decode(payload.imageBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail="imageBase64 contains invalid Base64 data.",
        ) from error

    if len(raw) == 0:
        raise HTTPException(status_code=422, detail="Formula image is empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Formula image exceeds the sidecar byte limit.",
        )
    if not raw.startswith(PNG_SIGNATURE):
        raise HTTPException(
            status_code=422,
            detail="Only valid PNG images are accepted.",
        )

    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format != "PNG":
                raise HTTPException(
                    status_code=422,
                    detail="Only PNG images are accepted.",
                )
            probe.verify()
        image = Image.open(io.BytesIO(raw))
        image.load()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as error:
        raise HTTPException(
            status_code=422,
            detail="Unable to decode the PNG image.",
        ) from error

    if getattr(image, "n_frames", 1) != 1:
        image.close()
        raise HTTPException(
            status_code=422,
            detail="Animated PNG images are unsupported.",
        )
    if image.width < 1 or image.height < 1:
        image.close()
        raise HTTPException(status_code=422, detail="Formula image is empty.")
    if image.width > MAX_IMAGE_SIDE or image.height > MAX_IMAGE_SIDE:
        image.close()
        raise HTTPException(
            status_code=413,
            detail=f"Image dimensions must not exceed {MAX_IMAGE_SIDE}px.",
        )

    converted = image.convert("RGB")
    image.close()
    return converted


def _result_mapping(result: FormulaResult) -> Mapping[str, Any]:
    payload = result.json
    if callable(payload):
        payload = payload()
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as error:
            raise RuntimeError("PaddleOCR returned invalid JSON.") from error
    if not isinstance(payload, Mapping):
        raise RuntimeError("PaddleOCR returned an unsupported result object.")
    return cast(Mapping[str, Any], payload)


def _extract_latex(result: FormulaResult) -> str:
    payload = _result_mapping(result)
    nested = payload.get("res")
    source = nested if isinstance(nested, Mapping) else payload
    latex = source.get("rec_formula")
    if not isinstance(latex, str) or latex.strip() == "":
        raise RuntimeError("PaddleOCR did not return rec_formula.")
    normalized = latex.strip()
    if len(normalized) > 4096:
        raise RuntimeError("PaddleOCR returned an oversized formula.")
    return normalized


def _run_inference(model: FormulaModel, image: Image.Image) -> str:
    image_array = np.asarray(image)
    results = list(model.predict(input=image_array, batch_size=1))
    if len(results) != 1:
        raise RuntimeError(f"Expected one PaddleOCR result, received {len(results)}.")
    return _extract_latex(results[0])


def create_app(
    *,
    settings: Settings | None = None,
    model_factory: ModelFactory | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    resolved_factory = model_factory or _default_model_factory

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        started = time.monotonic()
        app.state.model = await asyncio.to_thread(
            resolved_factory,
            resolved_settings,
        )
        app.state.inference_lock = asyncio.Lock()
        logger.info(
            json.dumps(
                {
                    "device": resolved_settings.device,
                    "durationMs": round((time.monotonic() - started) * 1000),
                    "engine": resolved_settings.engine,
                    "event": "paddle-formula.model-loaded",
                    "model": resolved_settings.model_name,
                },
                separators=(",", ":"),
            )
        )
        try:
            yield
        finally:
            app.state.model = None

    app = FastAPI(
        title="TutorBoard Paddle Formula Sidecar",
        version=SERVICE_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.model = None
    app.state.inference_lock = asyncio.Lock()

    @app.middleware("http")
    async def response_headers(request: Request, call_next: Callable[..., Any]):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {
            "service": SERVICE_NAME,
            "status": "ok",
            "version": SERVICE_VERSION,
        }

    @app.get("/readyz")
    async def readiness() -> dict[str, str]:
        if app.state.model is None:
            raise HTTPException(
                status_code=503,
                detail="PaddleOCR formula model is loading.",
            )
        return {
            "device": resolved_settings.device,
            "engine": resolved_settings.engine,
            "model": resolved_settings.model_name,
            "service": SERVICE_NAME,
            "status": "ready",
            "version": SERVICE_VERSION,
        }

    @app.post("/v1/recognize", response_model=RecognitionResponse)
    async def recognize(
        payload: RecognitionRequest,
        response: Response,
        authorization: Annotated[str | None, Header()] = None,
        x_tutorboard_request_id: Annotated[str | None, Header()] = None,
    ) -> RecognitionResponse:
        _authorize(resolved_settings, authorization)
        request_id = _request_id(x_tutorboard_request_id)
        response.headers["X-TutorBoard-Request-Id"] = request_id
        image = _decode_image(payload)
        started = time.monotonic()
        try:
            async with app.state.inference_lock:
                model = cast(FormulaModel | None, app.state.model)
                if model is None:
                    raise HTTPException(
                        status_code=503,
                        detail="PaddleOCR formula model is unavailable.",
                    )
                latex = await asyncio.to_thread(_run_inference, model, image)
        except HTTPException:
            raise
        except Exception as error:
            logger.error(
                json.dumps(
                    {
                        "durationMs": round((time.monotonic() - started) * 1000),
                        "event": "paddle-formula.recognition-failed",
                        "requestId": request_id,
                    },
                    separators=(",", ":"),
                ),
                exc_info=error,
            )
            raise HTTPException(
                status_code=502,
                detail="PaddleOCR formula recognition failed.",
            ) from error
        finally:
            image.close()

        logger.info(
            json.dumps(
                {
                    "durationMs": round((time.monotonic() - started) * 1000),
                    "event": "paddle-formula.recognized",
                    "requestId": request_id,
                },
                separators=(",", ":"),
            )
        )
        return RecognitionResponse(
            latex=latex,
            modelVersion=(
                f"{resolved_settings.model_name}/paddleocr-"
                f"{_package_version('paddleocr')}"
            ),
            requestId=request_id,
        )

    return app


app = create_app()
