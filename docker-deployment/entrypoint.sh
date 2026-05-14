#!/bin/sh
set -e

echo "[entrypoint] Running migrations (--fake-initial for legacy tables)..."
python manage.py migrate --noinput --fake-initial

echo "[entrypoint] Checking if data needs seeding..."
python manage.py shell -c "
from auth_api.models import User
if not User.objects.exists():
    import subprocess, sys
    seed = '/app/seed_data.json'
    import os
    if os.path.exists(seed):
        print('[entrypoint] Loading seed data...')
        subprocess.run([sys.executable, 'manage.py', 'loaddata', seed], check=True)
        print('[entrypoint] Seed data loaded.')
    else:
        print('[entrypoint] No seed_data.json found, skipping.')
else:
    print('[entrypoint] Data already exists, skipping loaddata.')
"

echo "[entrypoint] Starting Waitress..."
exec python -m waitress --host=0.0.0.0 --port=8001 --threads=8 ietm_backend.wsgi:application
