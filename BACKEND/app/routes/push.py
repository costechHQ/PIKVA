from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_session
from app.models.user import User, UserRole
from app.schemas.push import PushConfigResponse, PushSubscriptionCreate, PushSubscriptionRemove
from app.services.push_service import push_public_key, remove_subscription, save_subscription

router = APIRouter(
    prefix="/push",
    tags=["Push notifications"],
    dependencies=[Depends(require_role(UserRole.SCHOOL_ADMIN))],
)


@router.get("/config", response_model=PushConfigResponse)

async def push_config_endpoint():

    """Return the public key a browser subscribes with, or null when pushes are off."""

    return PushConfigResponse(public_key=push_public_key())


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)

async def subscribe_endpoint(
    data: PushSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Save the admin's browser to receive push notifications for new security alerts."""

    await save_subscription(
        session=session,
        user_id=current_user.id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/subscriptions/remove", status_code=status.HTTP_204_NO_CONTENT)

async def unsubscribe_endpoint(
    data: PushSubscriptionRemove,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):

    """Stop push notifications to one of the admin's own browsers."""

    await remove_subscription(session=session, user_id=current_user.id, endpoint=data.endpoint)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
