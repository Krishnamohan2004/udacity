FROM python:3.10-slim-bullseye

ENV FLASK_APP=__init__.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      libffi-dev \
      libssl-dev \
      libpcre3 \
      libpcre3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip pipenv

COPY Pipfile Pipfile.lock ./
RUN pipenv install --system --deploy --dev

COPY . .

RUN useradd --create-home --uid 1000 app && \
    chown -R app:app /app

USER app

EXPOSE 5000

CMD ["python", "__init__.py"]
