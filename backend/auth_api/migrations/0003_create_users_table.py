from django.db import migrations, connection


def create_users_table(apps, schema_editor):
    db = connection.vendor  # 'sqlite' or 'postgresql'
    if db == 'postgresql':
        id_col = "id SERIAL PRIMARY KEY"
        bool_default = "DEFAULT TRUE"
    else:
        id_col = "id INTEGER PRIMARY KEY AUTOINCREMENT"
        bool_default = "DEFAULT 1"

    with connection.cursor() as cursor:
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS users (
                {id_col},
                username      VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role          VARCHAR(255) NOT NULL DEFAULT 'viewer',
                department    VARCHAR(255),
                is_active     BOOLEAN NOT NULL {bool_default}
            )
        """)


class Migration(migrations.Migration):

    dependencies = [
        ('auth_api', '0002_alter_user_options'),
    ]

    operations = [
        migrations.RunPython(create_users_table, reverse_code=migrations.RunPython.noop),
    ]
