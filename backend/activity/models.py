from django.db import models

class UserActivity(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.IntegerField()
    action = models.CharField(max_length=255)
    details = models.TextField()
    at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'user_activity'
