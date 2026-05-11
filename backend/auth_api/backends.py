
import bcrypt
from .models import User

class BcryptAuthBackend:

    def authenticate(self, request, username=None, password=None):
        if not username or not password:
            return None

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return None

        try:
            valid = bcrypt.checkpw(
                password.encode('utf-8'),
                user.password.encode('utf-8')
            )
        except Exception:
            return None

        return user if valid else None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
