"""
Migration to actually create the 'users' table.

The initial migration (0001) was generated with managed=False, so Django
never created the table.  Migration 0002 flipped managed to True, but
Django's AlterModelOptions does not retroactively CREATE the table.

This migration fills the gap by running the equivalent CREATE TABLE.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('auth_api', '0002_alter_user_options'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS users (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                username  VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role      VARCHAR(255) NOT NULL DEFAULT 'viewer',
                department VARCHAR(255),
                is_active  BOOLEAN NOT NULL DEFAULT 1
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS users;",
        ),
    ]
