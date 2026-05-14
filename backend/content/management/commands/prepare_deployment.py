
from __future__ import annotations

import datetime
import shutil
import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

PROJECT_ROOT = Path(settings.BASE_DIR).resolve().parent
DJANGO_DIR = Path(settings.BASE_DIR).resolve()
PIPELINE_DIR = PROJECT_ROOT / "pipeline_updated"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
DIST_DIR = PROJECT_ROOT / "dist"
IETM_ROOT = PIPELINE_DIR / "ietm_new"

class Command(BaseCommand):
    help = "Orchestrate the full pipeline from DOCX to packaged deployment artifact."

    def add_arguments(self, parser):
        parser.add_argument("--phase", type=int, choices=[1, 2], required=True)
        parser.add_argument("--target", choices=["standalone", "docker"], required=True)
        parser.add_argument(
            "--inputs", nargs="+", default=[],
            help="DOCX files to ingest (phase 1 only).",
        )
        parser.add_argument(
            "--master-xml", default=str(IETM_ROOT / "master.xml"),
            help="Path to master.xml produced by the pipeline.",
        )
        parser.add_argument(
            "--skip-frontend-build", action="store_true",
            help="Skip pnpm build in phase 2 (use existing dist/).",
        )
        parser.add_argument(
            "--skip-embeddings", action="store_true",
            help="Skip embedding generation in phase 2 (re-use existing chroma_db/).",
        )
        parser.add_argument(
            "--include-wheels", default=None, metavar="PATH",
            help="Path to offline wheels dir — copied into the artifact so it runs without internet.",
        )

    def handle(self, *args, **opts):
        phase = opts["phase"]
        target = opts["target"]

        if phase == 1:
            self._phase1(opts["inputs"], opts["master_xml"])
        else:
            self._phase2(
                target, opts["master_xml"],
                opts["skip_frontend_build"], opts["skip_embeddings"],
                opts["include_wheels"],
            )

    def _phase1(self, inputs, master_xml):
        if not inputs:
            raise CommandError("--inputs is required for phase 1")

        self._log("PHASE 1: DOCX -> XML -> DB")

        IETM_ROOT.mkdir(parents=True, exist_ok=True)

        for docx in inputs:
            docx_path = Path(docx).resolve()
            if not docx_path.exists():
                raise CommandError(f"DOCX not found: {docx_path}")
            self._log(f"Converting: {docx_path.name}")
            self._run([
                sys.executable, "-m", "ietm_pipeline.main",
                "convert", str(docx_path), str(IETM_ROOT),
            ], cwd=PIPELINE_DIR)

        master = Path(master_xml)
        if not master.exists():
            raise CommandError(f"master.xml not found at {master} after conversion")

        self._log(f"Importing {master} into DB")
        call_command("import_xml", source=str(master))

        self._log("PHASE 1 COMPLETE")
        self.stdout.write(self.style.WARNING(
            "\nNEXT STEP — author hotspots:\n"
            "  1. Start the backend:    python manage.py runserver\n"
            "  2. Open the hotspot authoring UI and mark hotspots for each figure.\n"
            "  3. When done, run:       python manage.py prepare_deployment --phase=2 --target=<...>\n"
        ))

    def _phase2(self, target, master_xml, skip_frontend, skip_embeddings, include_wheels):
        self._log("PHASE 2: embeddings -> frontend build -> package")

        if not skip_embeddings:
            self._log("Skipping embedding generation (RAG removed)")

        if not skip_frontend:
            self._log("Building frontend (pnpm build)")
            self._run(["npm", "run", "build"], cwd=FRONTEND_DIR, shell_on_windows=True)
        else:
            self._log("Skipping frontend build (--skip-frontend-build)")

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        artifact = DIST_DIR / f"ietm_deploy_{target}_{ts}"
        self._log(f"Packaging artifact -> {artifact}")
        self._package(artifact, target, master_xml, include_wheels)

        self._log("PHASE 2 COMPLETE")
        self.stdout.write(self.style.SUCCESS(
            f"\nArtifact ready: {artifact}\n"
            f"Final manual step: see {artifact / 'README_DEPLOY.md'}\n"
        ))

    def _package(self, artifact: Path, target: str, master_xml: str, include_wheels=None):
        artifact.mkdir(parents=True, exist_ok=True)

        frontend_build = FRONTEND_DIR / "dist"
        if frontend_build.exists():
            shutil.copytree(frontend_build, artifact / "frontend", dirs_exist_ok=True)

        self._copy_backend(artifact / "django_backend")

        chroma = DJANGO_DIR / "chroma_db"
        if chroma.exists():
            shutil.copytree(chroma, artifact / "django_backend" / "chroma_db", dirs_exist_ok=True)

        ietm_new_dst = artifact / "pipeline_updated" / "ietm_new"
        if IETM_ROOT.exists():
            shutil.copytree(IETM_ROOT, ietm_new_dst, dirs_exist_ok=True)

        if target == "standalone":
            self._package_standalone(artifact, include_wheels)
        else:
            self._package_docker(artifact)

        self._write_readme(artifact, target)

    def _copy_backend(self, dst: Path):
        ignore = shutil.ignore_patterns(
            "__pycache__", "*.pyc", "*.pyo", "venv", ".venv", "node_modules",
            "db.sqlite3-journal",
        )
        shutil.copytree(DJANGO_DIR, dst, ignore=ignore, dirs_exist_ok=True)

    def _package_standalone(self, artifact: Path, include_wheels=None):

        db = DJANGO_DIR / "db.sqlite3"
        if db.exists():
            shutil.copy2(db, artifact / "django_backend" / "db.sqlite3")

        launcher = PROJECT_ROOT / "scripts" / "start-ietm-standalone.ps1"
        if not launcher.exists():
            launcher = PROJECT_ROOT / "start-ietm.ps1"
        if launcher.exists():
            shutil.copy2(launcher, artifact / "start-ietm.ps1")

        if include_wheels:
            wheels_src = Path(include_wheels)
            if wheels_src.is_dir():
                shutil.copytree(wheels_src, artifact / "wheels", dirs_exist_ok=True)
                self._log(f"Included wheels from {wheels_src}")
            else:
                self._log(f"WARNING: --include-wheels path not found: {wheels_src}")

        else:
            default_wheels = PROJECT_ROOT / "ietm_offline_bundle" / "python_wheels"
            if default_wheels.is_dir():
                shutil.copytree(default_wheels, artifact / "wheels", dirs_exist_ok=True)
                self._log(f"Auto-included wheels from {default_wheels}")

    def _package_docker(self, artifact: Path):
        docker_dir = PROJECT_ROOT / "docker-deployment"
        for name in ["docker-compose.yml", ".env", "nginx.conf", "Dockerfile", "seed_data.json"]:
            src = docker_dir / name
            if not src.exists():
                continue
            shutil.copy2(src, artifact / name)

    def _write_readme(self, artifact: Path, target: str):
        if target == "standalone":
            body = (
                "# IETM Standalone Deployment\n\n"
                "## Launch\n\n"
                "    pwsh ./start-ietm.ps1\n\n"
                "Prerequisites on target host:\n"
                "- Python 3.11 + wheels from the offline bundle installed\n"
                "- Ollama running with `nomic-embed-text` and a chat model loaded\n"
            )
        else:
            body = (
                "# IETM Docker Deployment\n\n"
                "## Prerequisites on target host\n"
                "- Docker Engine installed\n"
                "- Images pre-loaded from the offline bundle: `docker load -i <image>.tar`\n"
                "- Ollama models already copied to the ollama volume\n\n"
                "## Launch\n\n"
                "    docker compose --env-file .env.docker up -d\n"
            )
        (artifact / "README_DEPLOY.md").write_text(body, encoding="utf-8")

    def _log(self, msg: str):
        self.stdout.write(self.style.HTTP_INFO(f"[prepare_deployment] {msg}"))

    def _run(self, cmd, cwd: Path, shell_on_windows: bool = False):
        use_shell = shell_on_windows and sys.platform == "win32"
        result = subprocess.run(
            cmd, cwd=str(cwd), shell=use_shell,
            capture_output=False,
        )
        if result.returncode != 0:
            raise CommandError(f"Command failed ({result.returncode}): {' '.join(str(c) for c in cmd)}")
