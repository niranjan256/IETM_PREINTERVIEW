from django.contrib import admin

from .models import (
    ContentBlock, ContentNode, CrossReference, Document,
    Hotspot, Media,
)

admin.site.register(Document)
admin.site.register(ContentNode)
admin.site.register(ContentBlock)
admin.site.register(Media)
admin.site.register(Hotspot)
admin.site.register(CrossReference)
