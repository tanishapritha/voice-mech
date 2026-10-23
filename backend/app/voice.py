from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from livekit import api

from app.config import get_settings

router = APIRouter(prefix="/api/v1/voice", tags=["voice"])
settings = get_settings()


class TokenResponse(BaseModel):
    url: str
    token: str
    room_name: str


class TokenRequest(BaseModel):
    identity: str = Field(min_length=1, max_length=80)


@router.post("/token", response_model=TokenResponse)
def create_voice_token(body: TokenRequest):
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=503, detail="LiveKit credentials are not configured.")
    room_name = "voice-mech-phase1"
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(body.identity)
        .with_name("Voice Mech tester")
        .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True))
        .with_ttl(settings.session_token_ttl_seconds)
    )
    return {"url": settings.livekit_url, "token": token.to_jwt(), "room_name": room_name}
