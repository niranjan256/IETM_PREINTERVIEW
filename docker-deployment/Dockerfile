# Stage 1: Build React SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ .
RUN npm run build

# Stage 2: Django backend
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 libxslt1.1 libpq5 gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Bake media files into image — Docker seeds media_vol from here on first run
COPY backend/media/ /app/media/

ENV IETM_STATIC_ROOT=/app/static_root
ENV IETM_MEDIA_ROOT=/app/media
ENV IETM_MODE=network
ENV SERVE_SPA=0
ENV DJANGO_SETTINGS_MODULE=ietm_backend.settings

WORKDIR /app/backend

# Remove stale pre-built frontend so collectstatic doesn't include it
RUN rm -rf /app/backend/static/frontend

# Collect Django's own static files (admin CSS, fonts, etc.)
RUN python manage.py collectstatic --noinput

# Copy fresh React build AFTER collectstatic so it isn't overwritten
COPY --from=frontend-builder /frontend/dist/ /app/static_root/frontend/

COPY docker-deployment/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# seed_data.json is generated from SQLite before building the image
# COPY only if it exists — build won't fail if missing
COPY docker-deployment/seed_data.json* /app/

EXPOSE 8001
CMD ["/app/entrypoint.sh"]
