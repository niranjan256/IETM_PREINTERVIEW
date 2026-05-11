
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.db import IntegrityError

from .models import User
from .utils import hash_password

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    body = request.data or {}
    username = body.get('username')
    password = body.get('password')

    if not username or not password:
        return Response(
            {'error': 'Username and password required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = authenticate(request, username=username, password=password)

        if user is None:
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        django_login(request, user)

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            'success': True,
            'token': token.key,
            'user': {
                'id': user.id,
                'username': user.username,
                'role': user.role,
                'department': user.department,
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {'error': f'Server error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    body = request.data or {}
    username = body.get('username')
    password = body.get('password')
    role = body.get('role', 'viewer')
    department = body.get('department', 'General')

    if not username or not password:
        return Response(
            {'error': 'Username and password required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        User.objects.create(
            username=username,
            password=hash_password(password),
            role=role,
            department=department,
        )
        return Response(
            {'success': True, 'message': 'User registered successfully'},
            status=status.HTTP_201_CREATED
        )
    except IntegrityError:
        return Response(
            {'error': 'Username already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def logout(request):
    try:
        Token.objects.filter(user=request.user).delete()
        django_logout(request)
        return Response({'success': True, 'message': 'Logged out successfully'})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
