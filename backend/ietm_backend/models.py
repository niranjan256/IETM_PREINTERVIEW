
from django.db import models

class PrintLog(models.Model):
    user_id = models.IntegerField(null=True)
    topic_title = models.TextField(null=True)
    printed_at = models.TextField(null=True)
    details = models.TextField(null=True)

    class Meta:
        app_label = 'content'
        managed = False
        db_table = 'printlogs'

class Model3D(models.Model):
    model_name = models.CharField(max_length=255)

    class Meta:
        app_label = 'content'
        managed = False
        db_table = 'models_3d'

class ModelHotspot(models.Model):
    model = models.ForeignKey(Model3D, on_delete=models.CASCADE, related_name='hotspots')
    mesh_name = models.CharField(max_length=255)
    target_topic = models.CharField(max_length=255)

    class Meta:
        app_label = 'content'
        managed = False
        db_table = 'model_hotspots'

class Image(models.Model):
    image_name = models.CharField(max_length=255)

    class Meta:
        app_label = 'content'
        managed = False
        db_table = 'images'

class ImageHotspot(models.Model):
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name='hotspots')

    class Meta:
        app_label = 'content'
        managed = False
        db_table = 'image_hotspots'
