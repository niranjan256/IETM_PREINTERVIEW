
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import Bookmark

@api_view(['GET', 'POST'])
def bookmarks_list(request):
    if request.method == 'GET':
        try:
            bookmarks = list(
                Bookmark.objects
                .filter(user_id=request.user.id)
                .order_by('-created_at')
                .values('id', 'user_id', 'topic_title', 'topic_path', 'created_at')
            )
            return Response(bookmarks)
        except Exception:
            return Response(
                {'error': 'Server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    try:
        body = request.data or {}
        topic_title = body.get('topic_title')
        topic_path = body.get('topic_path')

        if not topic_title or not topic_path:
            return Response({'error': 'Missing fields'}, status=status.HTTP_400_BAD_REQUEST)

        bookmark, _ = Bookmark.objects.get_or_create(
            user_id=request.user.id,
            topic_path=topic_path,
            defaults={'topic_title': topic_title},
        )
        return Response({
            'id': bookmark.id,
            'user_id': bookmark.user_id,
            'topic_title': bookmark.topic_title,
            'topic_path': bookmark.topic_path,
            'created_at': bookmark.created_at,
        })
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['DELETE'])
def delete_bookmark(request, id):
    try:
        Bookmark.objects.filter(id=id, user_id=request.user.id).delete()
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
