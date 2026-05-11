
import bcrypt
from django.db.models import Count
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from auth_api.permissions import IsAdminRole
from .models import Department, UserGroup, GroupUser

def _admin_check(request):
    perm = IsAdminRole()
    if not perm.has_permission(request, None):
        return Response(
            {'error': perm.message},
            status=status.HTTP_403_FORBIDDEN
        )
    return None

@api_view(['GET'])
def get_departments(request):
    err = _admin_check(request)
    if err:
        return err

    try:
        departments = list(Department.objects.order_by('name').values('id', 'name'))
        return Response(departments)
    except Exception:
        return Response(
            {'error': 'Failed to load departments'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET', 'POST'])
def groups_list(request):
    err = _admin_check(request)
    if err:
        return err

    if request.method == 'GET':
        return _get_all_groups()
    return _create_group(request)

def _get_all_groups():
    try:
        qs = (
            UserGroup.objects
            .select_related('department')
            .annotate(user_count=Count('memberships'))
            .order_by('id')
        )
        groups = [
            {
                'id': g.id,
                'name': g.name,
                'description': g.description,
                'shared_username': g.shared_username,
                'department_id': g.department_id,
                'department_name': g.department.name if g.department else None,
                'user_count': g.user_count,
            }
            for g in qs
        ]
        return Response(groups)
    except Exception as e:
        print(f"Error fetching groups: {e}")
        return Response(
            {'error': 'Failed to load groups'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def _create_group(request):
    try:
        body = request.data or {}
        name = body.get('name')
        if not name:
            return Response(
                {'error': 'Group name required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        password_hash = None
        shared_password = body.get('shared_password')
        if shared_password:
            password_hash = bcrypt.hashpw(
                shared_password.encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')

        group = UserGroup.objects.create(
            name=name,
            description=body.get('description'),
            department_id=body.get('department_id'),
            shared_username=body.get('shared_username'),
            shared_password_hash=password_hash,
        )
        return Response(
            {
                'id': group.id,
                'name': group.name,
                'description': group.description,
                'shared_username': group.shared_username,
                'department_id': group.department_id,
            },
            status=status.HTTP_201_CREATED
        )
    except Exception as e:
        print(f"Error creating group: {e}")
        return Response(
            {'error': 'Failed to create group'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET', 'PUT', 'DELETE'])
def group_detail(request, id):
    err = _admin_check(request)
    if err:
        return err

    if request.method == 'GET':
        return _get_group_by_id(id)
    elif request.method == 'PUT':
        return _update_group(request, id)
    return _delete_group(id)

def _get_group_by_id(id):
    try:
        group = UserGroup.objects.select_related('department').get(pk=id)
    except UserGroup.DoesNotExist:
        return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error fetching group: {e}")
        return Response(
            {'error': 'Failed to load group details'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    members = list(
        group.memberships
        .select_related('user')
        .order_by('user__username')
        .values('user__id', 'user__username', 'user__department', 'user__is_active')
    )
    member_list = [
        {
            'id': m['user__id'],
            'username': m['user__username'],
            'department': m['user__department'],
            'is_active': m['user__is_active'],
        }
        for m in members
    ]

    return Response({
        'id': group.id,
        'name': group.name,
        'description': group.description,
        'department_id': group.department_id,
        'department_name': group.department.name if group.department else None,
        'shared_username': group.shared_username,
        'members': member_list,
    })

def _update_group(request, id):
    try:
        body = request.data or {}
        group = UserGroup.objects.get(pk=id)
    except UserGroup.DoesNotExist:
        return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error updating group: {e}")
        return Response(
            {'error': 'Failed to update group'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    try:
        group.name = body.get('name', group.name)
        group.description = body.get('description', group.description)
        group.department_id = body.get('department_id', group.department_id)

        shared_password = body.get('shared_password')
        if shared_password:
            group.shared_password_hash = bcrypt.hashpw(
                shared_password.encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')

        group.save()
        return Response({'message': 'Group updated'})
    except Exception as e:
        print(f"Error saving group: {e}")
        return Response(
            {'error': 'Failed to update group'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def _delete_group(id):
    try:
        UserGroup.objects.filter(pk=id).delete()
        return Response({'message': 'Group deleted'})
    except Exception as e:
        print(f"Error deleting group: {e}")
        return Response(
            {'error': 'Failed to delete group'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def assign_users(request, id):
    err = _admin_check(request)
    if err:
        return err

    try:
        body = request.data or {}
        user_ids = body.get('userIds', [])
        if not isinstance(user_ids, list):
            return Response(
                {'error': 'userIds must be array'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            group = UserGroup.objects.get(pk=id)
        except UserGroup.DoesNotExist:
            return Response({'error': 'Group not found'}, status=status.HTTP_404_NOT_FOUND)

        group.memberships.all().delete()

        GroupUser.objects.bulk_create(
            [GroupUser(group=group, user_id=uid) for uid in user_ids],
            ignore_conflicts=True,
        )

        return Response({'message': 'Users assigned'})
    except Exception as e:
        print(f"Error assigning users: {e}")
        return Response(
            {'error': 'Failed to assign users'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
