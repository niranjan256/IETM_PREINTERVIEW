from django.apps import AppConfig

class AuthApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'auth_api'
    default = True
    
    def ready(self):

        from django.contrib.auth.signals import user_logged_in
        from django.contrib.auth.models import update_last_login
        
        disconnected = user_logged_in.disconnect(update_last_login, dispatch_uid='update_last_login')

        if not disconnected:

             disconnected = user_logged_in.disconnect(update_last_login)

