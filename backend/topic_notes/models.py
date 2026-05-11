
from django.db import models

class TopicNote(models.Model):
    topic_id = models.TextField()
    user_id = models.IntegerField()
    content = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'topic_notes'

        unique_together = ('topic_id', 'user_id')

    def __str__(self):
        return f"TopicNote({self.user_id}, {self.topic_id})"
