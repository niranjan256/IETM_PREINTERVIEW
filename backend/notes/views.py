
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Note
from topic_notes.models import TopicNote

@api_view(['GET', 'DELETE'])
@permission_classes([AllowAny])
def note_detail(request, userId):
    if request.method == 'GET':
        try:
            note = Note.objects.get(user_id=userId)
            return Response({'content': note.content})
        except Note.DoesNotExist:
            return Response({'content': ''})
        except Exception:
            return Response(
                {'error': 'Server error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    try:
        Note.objects.filter(user_id=userId).delete()
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def save_note(request):
    if request.method == 'GET':

        if not request.user or not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        notes = (
            TopicNote.objects
            .filter(user_id=request.user.id)
            .order_by('-updated_at')
            .values('topic_id', 'content')
        )
        result = [
            {
                'topic_id': n['topic_id'],
                'topic_title': n['topic_id'],
                'content': n['content'] or '',
            }
            for n in notes
        ]
        return Response(result)

    try:
        body = request.data or {}
        user_id = body.get('userId')
        content = body.get('content', '')

        Note.objects.update_or_create(
            user_id=user_id,
            defaults={'content': content, 'updated_at': timezone.now()},
        )
        return Response({'success': True})
    except Exception:
        return Response(
            {'error': 'Server error'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['DELETE'])
def delete_note_by_topic(request, topicId):
    TopicNote.objects.filter(topic_id=topicId, user_id=request.user.id).delete()
    return Response({'success': True})
