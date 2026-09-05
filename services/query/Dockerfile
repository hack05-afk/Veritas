FROM python:3.12-slim

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY schema.yaml ./

# The loader writes Parquet here. Mount a volume or bake the files in.
ENV DATA_DIR=/srv/data
ENV PYTHONPATH=/srv
ENV DUCKDB_MEMORY_LIMIT=1GB
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
