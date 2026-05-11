
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import UserActivity

@api_view(['GET'])
@permission_classes([AllowAny])
def get_activity(request, userId):
    try:
        activities = list(
            UserActivity.objects
            .filter(user_id=userId)
            .order_by('-at')
            .values('id', 'action', 'details', 'at')[:50]
        )
        return Response(activities)
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([AllowAny])
def add_activity(request):
    try:
        body = request.data or {}
        UserActivity.objects.create(
            user_id=body.get('userId'),
            action=body.get('action'),
            details=body.get('details'),
        )
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
