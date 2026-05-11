"""Add MeshHotspot model and extend ContentBlock block_type choices."""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0001_initial"),
    ]

    operations = [
        # Widen block_type to accept new values (no data loss — CharField)
        migrations.AlterField(
            model_name="contentblock",
            name="block_type",
            field=models.CharField(
                choices=[
                    ("para", "Paragraph"),
                    ("list", "List"),
                    ("figure", "Figure"),
                    ("table", "Table"),
                    ("model3d", "3D Model"),
                    ("video", "Video"),
                    ("pdf", "PDF"),
                ],
                max_length=20,
            ),
        ),
        # New MeshHotspot table
        migrations.CreateModel(
            name="MeshHotspot",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "mesh_name",
                    models.CharField(
                        help_text="Mesh name in the GLB file, e.g. 'Piston_Head'",
                        max_length=200,
                    ),
                ),
                (
                    "target_xml_id",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Raw target section ID from XML for fallback resolution",
                        max_length=200,
                    ),
                ),
                (
                    "text",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Display label shown on the 3D hotspot",
                        max_length=500,
                    ),
                ),
                (
                    "media",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mesh_hotspots",
                        to="content.media",
                    ),
                ),
                (
                    "target_node",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="mesh_hotspot_targets",
                        to="content.contentnode",
                    ),
                ),
            ],
            options={"db_table": "content_mesh_hotspot"},
        ),
    ]
