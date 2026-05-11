
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import PrintLog, Model3D, Image

@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok'})

@api_view(['GET'])
@permission_classes([AllowAny])
def dbtest(request):
    try:
        from django.db import connection
        connection.ensure_connection()
        return Response({'status': 'ok'})
    except Exception:
        return Response(
            {'error': 'DB connection failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
def protected(request):
    user = request.user
    return Response({
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'department': user.department,
        }
    })

@api_view(['POST'])
@permission_classes([AllowAny])
def print_logs(request):
    try:
        body = request.data or {}
        PrintLog.objects.create(
            user_id=body.get('userId'),
            topic_title=body.get('topicTitle'),
            printed_at=body.get('printedAt'),
            details=body.get('details'),
        )
    except Exception:
        pass
    return Response({'success': True})

@api_view(['GET'])
@permission_classes([AllowAny])
def model_hotspots(request, modelName):
    try:
        model = Model3D.objects.filter(model_name=modelName).first()
        if not model:
            return Response([])
        hotspots = list(
            model.hotspots.values('mesh_name', 'target_topic')
        )
        return Response(hotspots)
    except Exception:
        return Response([])

@api_view(['GET'])
@permission_classes([AllowAny])
def image_hotspots(request, imageName):
    try:
        image = Image.objects.filter(image_name=imageName).first()
        if not image:
            return Response([])

        hotspots = list(image.hotspots.values())
        return Response(hotspots)
    except Exception:
        return Response([])
