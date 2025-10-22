# syntax=docker/dockerfile:1.7-labs
# FastAPI agent container (linux/arm64) for Amazon Bedrock AgentCore
FROM python:3.11-slim-bullseye AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies (ffmpeg for audio processing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy dependency list
COPY requirements.txt ./

RUN pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt && \
    pip install "aws-opentelemetry-distro>=0.10.1"

# Copy application code
COPY src ./src

ENV PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
