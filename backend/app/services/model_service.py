"""Model management service."""

from uuid import uuid4
from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.db.models import MLModel, ModelStatus, SourceType
from app.core.exceptions import DuplicateModelError


logger = logging.getLogger(__name__)


class ModelService:
    """Service for ML model management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_identifier(
        self,
        source_type: str,
        source_identifier: str,
    ) -> Optional[MLModel]:
        """Find a model by source type and identifier."""
        stmt = select(MLModel).where(
            and_(
                MLModel.source_type == source_type,
                MLModel.source_identifier == source_identifier,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_sha256(self, sha256: str) -> Optional[MLModel]:
        """Find a model by SHA-256 hash."""
        stmt = select(MLModel).where(MLModel.sha256 == sha256)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_or_get(
        self,
        source_type: str,
        source_identifier: str,
        name: str,
        source_url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[dict] = None,
    ) -> MLModel:
        """Create a new model or return existing one with same identifier."""
        existing = await self.find_by_identifier(source_type, source_identifier)
        if existing:
            logger.info(f"Model already exists: {existing.id}")
            return existing

        model = MLModel(
            id=str(uuid4()),
            name=name,
            source_type=source_type,
            source_identifier=source_identifier,
            source_url=source_url,
            status=ModelStatus.READY,
            tags=tags or [],
            model_metadata=metadata or {},
        )
        self.db.add(model)
        await self.db.flush()
        logger.info(f"Created new model: {model.id}")
        return model

    async def mark_ready(
        self,
        model_id: str,
        storage_path: str,
        sha256: Optional[str] = None,
        size_bytes: Optional[int] = None,
        metadata: Optional[dict] = None,
    ) -> MLModel:
        """Mark a model as ready."""
        stmt = select(MLModel).where(MLModel.id == model_id)
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            raise ValueError(f"Model not found: {model_id}")

        model.storage_path = storage_path
        model.sha256 = sha256
        model.size_bytes = size_bytes
        model.status = ModelStatus.READY
        if metadata:
            model.model_metadata = metadata

        await self.db.flush()
        logger.info(f"Model marked as ready: {model_id}")
        return model

    async def mark_corrupt(
        self,
        model_id: str,
        error_message: Optional[str] = None,
    ) -> MLModel:
        """Mark a model as corrupt."""
        stmt = select(MLModel).where(MLModel.id == model_id)
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            raise ValueError(f"Model not found: {model_id}")

        model.status = ModelStatus.CORRUPT
        if error_message:
            model.model_metadata["error"] = error_message

        await self.db.flush()
        logger.info(f"Model marked as corrupt: {model_id}")
        return model

    async def get_by_id(self, model_id: str) -> Optional[MLModel]:
        """Get a model by ID."""
        stmt = select(MLModel).where(MLModel.id == model_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_model(self, model_id: str) -> None:
        """Mark a model as deleted."""
        stmt = select(MLModel).where(MLModel.id == model_id)
        result = await self.db.execute(stmt)
        model = result.scalar_one_or_none()

        if model:
            model.status = ModelStatus.DELETED
            await self.db.flush()
            logger.info(f"Model marked as deleted: {model_id}")

    async def list_models(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> tuple[List[MLModel], int]:
        """List models with optional filtering."""
        query = select(MLModel)

        if status:
            query = query.where(MLModel.status == status)

        if tags:
            # Simple filter: model must have all requested tags
            for tag in tags:
                query = query.where(MLModel.tags.contains([tag]))

        # Get total count
        count_result = await self.db.execute(
            select(MLModel) if not status and not tags
            else query
        )
        total = len(count_result.fetchall())

        # Get paginated results
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        models = result.scalars().all()

        return models, total
