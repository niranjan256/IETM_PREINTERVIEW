
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from .models import TopicNote

@api_view(['GET', 'POST'])
def topic_notes_list(request):
    if request.method == 'GET':
        return _get_all_topic_notes(request)
    return _save_topic_note(request)

def _get_all_topic_notes(request):
    notes = TopicNote.objects.filter(user_id=request.user.id).order_by('-updated_at')
    
    from content.models import ContentNode
    node_ids = [int(n.topic_id) for n in notes if n.topic_id.isdigit()]
    nodes = ContentNode.objects.filter(id__in=node_ids).values('id', 'title')
    title_map = {str(n['id']): n['title'] for n in nodes}
    
    data = []
    for n in notes:
        data.append({
            'topic_id': n.topic_id,
            'topic_title': title_map.get(n.topic_id, "General Document Note"),
            'content': n.content,
            'updated_at': n.updated_at,
        })
    return Response(data)

def _save_topic_note(request):
    body = request.data or {}
    topic_id = body.get('topicId')
    content = body.get('content', '')

    if not topic_id:
        return Response(
            {'error': 'topicId is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    note, _ = TopicNote.objects.update_or_create(
        topic_id=topic_id,
        user_id=request.user.id,
        defaults={'content': content},
    )
    
    title = "General Document Note"
    if topic_id.isdigit():
        from content.models import ContentNode
        titlenode = ContentNode.objects.filter(id=int(topic_id)).first()
        if titlenode:
            title = titlenode.title

    return Response({
        'topic_id': note.topic_id,
        'topic_title': title,
        'content': note.content,
        'updated_at': note.updated_at,
    })

@api_view(['GET', 'DELETE'])
def topic_note_detail(request, topicId):
    if request.method == 'DELETE':
        TopicNote.objects.filter(topic_id=topicId, user_id=request.user.id).delete()
        return Response({'success': True})

    note = TopicNote.objects.filter(
        topic_id=topicId, user_id=request.user.id
    ).first()
    if not note:
        return Response({'topic_id': topicId, 'topic_title': 'General Document Note', 'content': '', 'updated_at': None})
        
    title = "General Document Note"
    if topicId.isdigit():
        from content.models import ContentNode
        titlenode = ContentNode.objects.filter(id=int(topicId)).first()
        if titlenode:
            title = titlenode.title
            
    return Response({
        'topic_id': note.topic_id,
        'topic_title': title,
        'content': note.content,
        'updated_at': note.updated_at,
    })
