# Build the ML inference service with both Node.js and Python available.
FROM node:22-bookworm-slim

# Install Python (including pip) so the Node gateway can execute the ML modules.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        python3-pip \
        python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies first to leverage Docker layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Install Python dependencies needed by src/* modules.
COPY requirements.txt ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/python -m pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy the remaining application code (Node server and Python sources).
COPY . .

ENV NODE_ENV=production \
    PYTHONPATH=/app \
    PATH=/opt/venv/bin:$PATH \
    PYTHON_BIN=/opt/venv/bin/python

EXPOSE 5050

CMD ["npm", "start"]
