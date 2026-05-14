from django.db import models

class Bookmark(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.IntegerField()
    topic_title = models.CharField(max_length=255)
    topic_path = models.CharField(max_length=255)
    created_at = models.DateTimeField(null=True)

    class Meta:
        db_table = 'bookmarks'
