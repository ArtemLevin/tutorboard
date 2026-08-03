# TutorBoard Paddle formula sidecar

The sidecar exposes PaddleOCR Formula Recognition through the bounded contract used
by the TutorBoard formula-recognition gateway.

## Contract

```text
GET  /healthz
GET  /readyz
POST /v1/recognize
```

Request:

```json
{
  "imageBase64": "<PNG bytes encoded as Base64>",
  "mimeType": "image/png"
}
```

Response:

```json
{
  "latex": "x^2+1",
  "modelVersion": "PP-FormulaNet-S/paddleocr-3.7.0",
  "requestId": "recognition:example"
}
```

The sidecar accepts PNG images up to 768 KiB and 768 pixels per side. It rejects
unknown request properties, animated PNG files, invalid Base64, unsupported MIME
types and PaddleOCR output larger than 4,096 characters.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PADDLE_FORMULA_MODEL` | `PP-FormulaNet-S` | PaddleOCR formula model |
| `PADDLE_FORMULA_MODEL_DIR` | empty | Optional pre-downloaded model directory |
| `PADDLE_FORMULA_DEVICE` | `cpu` | `cpu`, `gpu:0` or another Paddle device |
| `PADDLE_FORMULA_ENGINE` | `paddle_static` | PaddleOCR inference engine |
| `PADDLE_FORMULA_API_TOKEN` | empty | Optional internal bearer token |
| `PADDLE_FORMULA_CPU_THREADS` | `8` | CPU inference threads |
| `PADDLE_FORMULA_ENABLE_HPI` | `false` | High-performance inference switch |
| `PADDLE_FORMULA_ENABLE_MKLDNN` | `true` | MKL-DNN switch for CPU inference |
| `PADDLE_FORMULA_USE_TENSORRT` | `false` | TensorRT switch for GPU inference |
| `PADDLE_FORMULA_PRECISION` | `fp32` | TensorRT precision: `fp32` or `fp16` |
| `PADDLE_PDX_MODEL_SOURCE` | image default `BOS` | Paddle model download source |

The service loads one model during process startup and serializes inference through
one lock. This keeps GPU memory usage predictable and avoids concurrent access to
a single Paddle inference object.

## CPU deployment

Create a deployment environment file:

```bash
cp deploy/paddle-formula.env.example deploy/paddle-formula.env
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated token in `deploy/paddle-formula.env`, then run:

```bash
docker compose \
  --env-file deploy/paddle-formula.env \
  --file deploy/math-ink.compose.yml \
  --file deploy/paddle-formula.compose.yml \
  up --build --detach
```

The CPU image installs PaddlePaddle 3.3.1 and PaddleOCR 3.7.0. The default model is
`PP-FormulaNet-S` with eight CPU threads and MKL-DNN enabled.

## GPU deployment

Install the NVIDIA driver and NVIDIA Container Toolkit, verify that Docker can see
the GPU, then add the GPU override:

```bash
docker run --rm --gpus all \
  nvidia/cuda:11.8.0-base-ubuntu22.04 \
  nvidia-smi

docker compose \
  --env-file deploy/paddle-formula.env \
  --file deploy/math-ink.compose.yml \
  --file deploy/paddle-formula.compose.yml \
  --file deploy/paddle-formula.gpu.compose.yml \
  up --build --detach
```

The GPU image uses CUDA 11.8 and PaddlePaddle GPU 3.3.0. TensorRT stays disabled in
the initial configuration. Enable it only after the standard `paddle_static` path
works on the target host.

## Operations

Check startup and model download:

```bash
docker compose \
  --env-file deploy/paddle-formula.env \
  --file deploy/math-ink.compose.yml \
  --file deploy/paddle-formula.compose.yml \
  logs --follow paddle-formula
```

Check readiness from the gateway container:

```bash
docker compose \
  --env-file deploy/paddle-formula.env \
  --file deploy/math-ink.compose.yml \
  --file deploy/paddle-formula.compose.yml \
  exec math-ink-proxy \
  node -e "fetch('http://paddle-formula:8080/readyz').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })"
```

The model cache is stored in named volumes:

```text
paddle-formula-models
paddle-formula-cache
```

Removing both volumes forces a fresh model download.

## Local API tests

The test suite injects a fake model and does not download PaddleOCR weights:

```bash
cd services/paddle-formula-sidecar
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m ruff format --check app.py tests
python -m ruff check app.py tests
python -m pytest
```

On Windows PowerShell, activate the environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```
