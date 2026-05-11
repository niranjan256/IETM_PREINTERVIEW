
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import RecentSearch

@api_view(['GET'])
@permission_classes([AllowAny])
def get_recent_searches(request, userId):
    try:
        searches = list(
            RecentSearch.objects
            .filter(user_id=userId)
            .order_by('-at')
            .values('id', 'term', 'at')[:50]
        )
        return Response(searches)
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([AllowAny])
def add_search(request):
    try:
        body = request.data or {}
        RecentSearch.objects.create(
            user_id=body.get('userId'),
            term=body.get('term'),
        )
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
