
from django.conf import settings
from django.db import models

class Department(models.Model):
    name = models.CharField(max_length=255)

    class Meta:
        managed = False
        db_table = 'departments'

    def __str__(self):
        return self.name

class UserGroup(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    shared_username = models.CharField(max_length=255, null=True, blank=True)
    shared_password_hash = models.CharField(max_length=255, null=True, blank=True)
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='groups'
    )

    class Meta:
        managed = False
        db_table = 'groups'

    def __str__(self):
        return self.name

class GroupUser(models.Model):
    group = models.ForeignKey(
        UserGroup, on_delete=models.CASCADE, related_name='memberships'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='group_memberships'
    )

    class Meta:
        managed = False
        db_table = 'group_users'
        unique_together = [('group', 'user')]
