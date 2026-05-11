
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db import IntegrityError

from auth_api.models import User
from auth_api.permissions import IsAdminRole
from auth_api.utils import hash_password

@api_view(['GET', 'POST'])
def users_list(request):

    perm = IsAdminRole()
    if not perm.has_permission(request, None):
        return Response({'error': perm.message}, status=status.HTTP_403_FORBIDDEN)

    try:
        if request.method == 'GET':
            return _get_all_users(request)
        return _create_user(request)
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def _get_all_users(request):
    search = request.query_params.get('search', '').strip()
    qs = User.objects.all()
    if search:
        qs = qs.filter(username__icontains=search)
    users = list(qs.order_by('id').values('id', 'username', 'role', 'department', 'is_active'))
    return Response(users)

def _create_user(request):
    try:
        body = request.data or {}
        user = User.objects.create(
            username=body.get('username'),
            password=hash_password(body.get('password', '')),
            role=body.get('role', 'viewer'),
            department=body.get('department'),
            is_active=body.get('is_active', True),
        )
        return Response({'success': True, 'userId': user.id}, status=status.HTTP_201_CREATED)
    except IntegrityError:
        return Response({'error': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
def user_detail(request, id):
    perm = IsAdminRole()
    if not perm.has_permission(request, None):
        return Response({'error': perm.message}, status=status.HTTP_403_FORBIDDEN)

    try:
        if request.method == 'GET':
            return _get_single_user(id)
        elif request.method == 'PUT':
            return _update_user(request, id)
        return _delete_user(id)
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def _get_single_user(id):
    user = User.objects.filter(id=id).values(
        'id', 'username', 'role', 'department', 'is_active'
    ).first()
    if not user:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
    return Response(user)

def _update_user(request, id):
    if not User.objects.filter(id=id).exists():
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    body = request.data or {}
    fields = {}
    if body.get('username'):
        fields['username'] = body['username']
    if 'role' in body:
        fields['role'] = body['role']
    if 'department' in body:
        fields['department'] = body['department']
    if 'is_active' in body:
        fields['is_active'] = body['is_active']
    if body.get('password'):
        fields['password'] = hash_password(body['password'])

    if fields:
        User.objects.filter(id=id).update(**fields)
    return Response({'success': True, 'updatedId': id})

def _delete_user(id):
    User.objects.filter(id=id).delete()
    return Response({'success': True})

@api_view(['PUT'])
def user_status(request, id):
    perm = IsAdminRole()
    if not perm.has_permission(request, None):
        return Response({'error': perm.message}, status=status.HTTP_403_FORBIDDEN)

    try:
        body = request.data or {}
        User.objects.filter(id=id).update(is_active=body.get('is_active'))
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
