from django.db import models

class RecentSearch(models.Model):
    id = models.AutoField(primary_key=True)
    user_id = models.IntegerField()
    term = models.CharField(max_length=255)
    at = models.DateTimeField()

    class Meta:
        db_table = 'recent_searches'
