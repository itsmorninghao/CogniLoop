"""Knowledge base schemas."""

from datetime import datetime

from pydantic import BaseModel, Field


class KBCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    tags: list[str] = []
    kb_type: str = Field(default="document", pattern="^document$")


class KBUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class KBResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: str | None = None
    tags: list | None = None
    kb_type: str
    share_code: str | None = None
    shared_to_plaza_at: datetime | None = None
    document_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_folder_id: int | None = None


class FolderResponse(BaseModel):
    id: int
    knowledge_base_id: int
    parent_folder_id: int | None = None
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: int
    knowledge_base_id: int
    folder_id: int | None = None
    filename: str
    original_filename: str
    file_type: str
    status: str
    error_message: str | None = None
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class KBPlazaItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    tags: list[str] | None = None
    kb_type: str
    document_count: int
    share_code: str | None = None
    shared_to_plaza_at: datetime
    acquire_count: int = 0
    creator_full_name: str
    creator_username: str
    creator_avatar_url: str | None = None
    created_at: datetime


class KBPlazaPage(BaseModel):
    items: list[KBPlazaItem]
    total: int


class AcquireByShareCodeRequest(BaseModel):
    share_code: str = Field(min_length=1, max_length=12)
