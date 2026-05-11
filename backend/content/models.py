
from django.db import models

class Document(models.Model):
    doc_id = models.CharField(max_length=100, unique=True, db_index=True)
    title = models.CharField(max_length=500)
    doc_type = models.CharField(max_length=100, default="Technical Manual")
    classification = models.CharField(max_length=50, default="UNCLASSIFIED")
    generated_date = models.DateField(null=True, blank=True)
    generator_version = models.CharField(max_length=20, default="1.0")
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "content_document"

    def __str__(self):
        return f"{self.doc_id}: {self.title}"

class ContentNode(models.Model):
    SECTION = "section"
    LEAF_GROUP = "leaf_group"
    LEAF = "leaf"
    NODE_TYPE_CHOICES = [
        (SECTION, "Section"),
        (LEAF_GROUP, "Leaf Group"),
        (LEAF, "Leaf"),
    ]

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="nodes"
    )
    node_type = models.CharField(max_length=20, choices=NODE_TYPE_CHOICES)
    xml_id = models.CharField(
        max_length=200, db_index=True,
        help_text="Original ID from XML, e.g. 'CALM_DS_sec_1_2_3'"
    )
    number = models.CharField(
        max_length=50,
        help_text="Dotted section number, e.g. '1.2.3'"
    )
    title = models.CharField(max_length=500)
    level = models.IntegerField(
        default=1,
        help_text="Heading level (1-6) for sections"
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True,
        related_name="children"
    )
    path = models.CharField(
        max_length=500, db_index=True,
        help_text="Materialized path for fast traversal, e.g. '1.2.3'"
    )
    order = models.IntegerField(
        default=0,
        help_text="Sort order among siblings"
    )

    leaf_group_root = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="leaf_group_members",
        help_text="For leaf-group nodes: FK to the root section"
    )

    class Meta:
        db_table = "content_node"
        ordering = ["path"]
        indexes = [
            models.Index(fields=["document", "path"]),
            models.Index(fields=["document", "xml_id"]),
            models.Index(fields=["parent", "order"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "xml_id"],
                name="unique_node_per_doc"
            ),
        ]

    def __str__(self):
        return f"[{self.node_type}] {self.number} — {self.title}"

class ContentBlock(models.Model):
    PARA = "para"
    LIST = "list"
    FIGURE = "figure"
    TABLE = "table"
    MODEL3D = "model3d"
    VIDEO = "video"
    PDF = "pdf"
    BLOCK_TYPE_CHOICES = [
        (PARA, "Paragraph"),
        (LIST, "List"),
        (FIGURE, "Figure"),
        (TABLE, "Table"),
        (MODEL3D, "3D Model"),
        (VIDEO, "Video"),
        (PDF, "PDF"),
    ]

    node = models.ForeignKey(
        ContentNode, on_delete=models.CASCADE, related_name="blocks"
    )
    block_type = models.CharField(max_length=20, choices=BLOCK_TYPE_CHOICES)
    order = models.IntegerField(
        help_text="Document order within parent node"
    )
    content_html = models.TextField(
        blank=True, default="",
        help_text="Pre-rendered HTML content for this block"
    )

    raw_data = models.JSONField(
        null=True, blank=True,
        help_text="Structured data: table CALS structure, list items, figure metadata"
    )

    class Meta:
        db_table = "content_block"
        ordering = ["node", "order"]
        indexes = [
            models.Index(fields=["node", "order"]),
        ]

    def __str__(self):
        return f"{self.block_type} #{self.order} in {self.node}"

class Media(models.Model):
    IMAGE = "image"
    MODEL_3D = "3d_model"
    VIDEO = "video"
    PDF = "pdf"
    MEDIA_TYPE_CHOICES = [
        (IMAGE, "Image"),
        (MODEL_3D, "3D Model"),
        (VIDEO, "Video"),
        (PDF, "PDF"),
    ]

    block = models.ForeignKey(
        ContentBlock, on_delete=models.CASCADE, related_name="media",
        null=True, blank=True,
        help_text="Content block this media belongs to (figure/table)"
    )
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="media"
    )
    media_type = models.CharField(max_length=20, choices=MEDIA_TYPE_CHOICES)
    file_path = models.CharField(
        max_length=500,
        help_text="Relative path to media file from MEDIA_ROOT"
    )
    original_filename = models.CharField(max_length=500, blank=True, default="")

    xml_id = models.CharField(
        max_length=200, db_index=True, blank=True, default="",
        help_text="Original ID from XML, e.g. 'fig-1.1' or 'tbl-2.3'"
    )
    number = models.CharField(max_length=50, blank=True, default="")
    title = models.CharField(max_length=500, blank=True, default="")

    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    format = models.CharField(
        max_length=20, blank=True, default="",
        help_text="Image format: png, jpeg, gif, webp"
    )

    class Meta:
        db_table = "content_media"
        indexes = [
            models.Index(fields=["document", "xml_id"]),
        ]

    def __str__(self):
        return f"{self.media_type}: {self.file_path}"

class Hotspot(models.Model):
    media = models.ForeignKey(
        Media, on_delete=models.CASCADE, related_name="hotspots"
    )
    x = models.IntegerField()
    y = models.IntegerField()
    width = models.IntegerField()
    height = models.IntegerField()
    target_node = models.ForeignKey(
        ContentNode, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="hotspot_targets",
        help_text="Target section/leaf this hotspot navigates to"
    )
    target_xml_id = models.CharField(
        max_length=200, blank=True, default="",
        help_text="Raw target ID from XML for fallback resolution"
    )
    label = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "content_hotspot"

    def __str__(self):
        return f"Hotspot ({self.x},{self.y}) → {self.target_xml_id or self.target_node}"

class MeshHotspot(models.Model):
    media = models.ForeignKey(
        Media, on_delete=models.CASCADE, related_name="mesh_hotspots"
    )
    mesh_name = models.CharField(
        max_length=200,
        help_text="Mesh name in the GLB file, e.g. 'Piston_Head'"
    )
    target_node = models.ForeignKey(
        ContentNode, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="mesh_hotspot_targets"
    )
    target_xml_id = models.CharField(
        max_length=200, blank=True, default="",
        help_text="Raw target section ID from XML for fallback resolution"
    )
    text = models.CharField(
        max_length=500, blank=True, default="",
        help_text="Display label shown on the 3D hotspot"
    )

    class Meta:
        db_table = "content_mesh_hotspot"

    def __str__(self):
        return f"MeshHotspot '{self.mesh_name}' → {self.target_xml_id or self.target_node}"

class CrossReference(models.Model):
    FIGURE = "figure"
    TABLE = "table"
    SECTION = "section"
    REF_TYPE_CHOICES = [
        (FIGURE, "Figure"),
        (TABLE, "Table"),
        (SECTION, "Section"),
    ]

    source_block = models.ForeignKey(
        ContentBlock, on_delete=models.CASCADE, related_name="xrefs"
    )
    ref_type = models.CharField(max_length=20, choices=REF_TYPE_CHOICES)
    display_text = models.CharField(
        max_length=200,
        help_text="Display text, e.g. 'Figure 1.1'"
    )
    target_xml_id = models.CharField(
        max_length=200, db_index=True,
        help_text="Target ID from XML, e.g. 'fig-1.1'"
    )

    target_node = models.ForeignKey(
        ContentNode, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="incoming_xrefs"
    )
    target_media = models.ForeignKey(
        Media, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="incoming_xrefs"
    )

    class Meta:
        db_table = "content_crossreference"
        indexes = [
            models.Index(fields=["target_xml_id"]),
        ]

    def __str__(self):
        return f"{self.display_text} → {self.target_xml_id}"
