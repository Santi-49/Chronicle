from typing import List, Optional

from pydantic import BaseModel, Field, validator


class CompareImagesInput(BaseModel):
    file_name: str
    previous_image_path: Optional[str] = None
    current_image_path: str


class VersionAnnotation(BaseModel):
    summary: str = Field(..., min_length=1)
    changes: List[str] = Field(..., min_items=1, max_items=6)
    tags: List[str] = Field(..., min_items=3, max_items=8)

    @validator("summary")
    def summary_must_not_be_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("summary must not be empty")
        return value

    @validator("changes", each_item=True)
    def validate_change(cls, change: str) -> str:
        change = change.strip()

        if not change:
            raise ValueError("changes must not contain empty strings")

        return change

    @validator("tags", each_item=True)
    def tags_must_be_lowercase(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("tags must not contain empty strings")
        if value != value.lower():
            raise ValueError("tags must be lowercase")
        return value