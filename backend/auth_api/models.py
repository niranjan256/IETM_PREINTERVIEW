from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models

class UserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('Username is required')
        user = self.model(username=username, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        return self.create_user(username, password, **extra_fields)

class User(AbstractBaseUser):

    last_login = None

    id = models.AutoField(primary_key=True)
    username = models.CharField(max_length=255, unique=True)

    password = models.CharField(max_length=255, db_column='password_hash')
    role = models.CharField(max_length=255, default='viewer')
    department = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        managed = False
        db_table = 'users'

    def __str__(self):
        return self.username
