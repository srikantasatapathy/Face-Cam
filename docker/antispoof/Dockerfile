FROM python:3.12-slim

WORKDIR /app

# Model weights are mounted or COPYed in separately, never baked into the repo.
ENV MODEL_DIR=/models
RUN mkdir -p /models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8081/health')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081"]
