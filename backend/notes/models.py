from django.db import models

class Note(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.IntegerField()
    content = models.TextField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'notes'
