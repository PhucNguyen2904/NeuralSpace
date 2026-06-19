from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db, get_current_user, UserContext
from app.models.mlops_tracking import DVCProfile
from app.utils.github_app import exchange_code_for_installation_id
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/github", tags=["github-auth"])


@router.get("/connect")
async def connect_github(
    profile_id: str = Query(...),
    current_user: UserContext = Depends(get_current_user),
):
    """
    Redirect user sang GitHub để cài GitHub App.
    Dùng settings.BACKEND_URL (được set tự động từ ngrok khi dev).
    """
    settings = get_settings()
    # BACKEND_URL lúc này đã là ngrok URL nhờ lifespan startup
    callback_url = f"{settings.BACKEND_URL}/api/v1/github/callback"
    state = f"{profile_id}:{current_user.user_id}"

    github_url = (
        f"https://github.com/apps/{settings.GITHUB_APP_NAME}/installations/new"
        f"?state={state}"
        f"&redirect_uri={callback_url}"
    )
    return RedirectResponse(url=github_url)


@router.get("/callback")
async def github_oauth_callback(
    code: str = Query(None),
    installation_id: int = Query(None),
    setup_action: str = Query(None),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    GitHub redirect về đây sau khi user cho phép.
    Xử lý xong → redirect về Next.js frontend.
    """
    settings = get_settings()
    try:
        if ":" in state:
            profile_id, user_id = state.split(":", 1)
        else:
            profile_id = state
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    final_installation_id = None
    try:
        if code:
            final_installation_id = await exchange_code_for_installation_id(code)
        elif installation_id and setup_action == "install":
            final_installation_id = installation_id
        else:
            raise ValueError("No code or installation_id provided")
    except ValueError as e:
        if "Không tìm thấy" in str(e):
            # User chưa cài App trên repo nào, redirect họ sang trang cài đặt App
            github_url = (
                f"https://github.com/apps/{settings.GITHUB_APP_NAME}/installations/new"
                f"?state={state}"
            )
            return RedirectResponse(url=github_url)
            
        logger.error(f"GitHub OAuth ValueError: {e}", exc_info=True)
        return RedirectResponse(
            url=(
                f"{settings.FRONTEND_URL}/dvc-profiles/new"
                f"?oauth=error&profile_id={profile_id}"
            )
        )
    except Exception as e:
        logger.error(f"GitHub OAuth error: {e}", exc_info=True)
        # Redirect về frontend với error state
        return RedirectResponse(
            url=(
                f"{settings.FRONTEND_URL}/dvc-profiles/new"
                f"?oauth=error&profile_id={profile_id}"
            )
        )

    # Lưu installation_id vào DB
    profile = await db.get(DVCProfile, profile_id)
    if profile:
        profile.github_installation_id = final_installation_id
        profile.status = "pending_repo_selection"
        profile.status_message = "App connected. Please select repository."
        await db.commit()

    # Redirect về Next.js
    return RedirectResponse(
        url=(
            f"{settings.FRONTEND_URL}/dvc-profiles/new"
            f"?oauth=success&profile_id={profile_id}"
        )
    )
