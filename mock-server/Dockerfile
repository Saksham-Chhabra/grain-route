# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        python-is-python3 \
        build-essential \
        ca-certificates \
        curl \
        libxml2-dev \
        libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/python -m pip install --no-cache-dir --break-system-packages \
        gdown \
        pandas \
        pymongo \
        tqdm \
        openpyxl \
        lxml

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production \
    PATH=/opt/venv/bin:$PATH \
    PYTHON_BIN=/opt/venv/bin/python
EXPOSE 5001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
