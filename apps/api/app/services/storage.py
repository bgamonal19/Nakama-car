from pathlib import Path
from uuid import UUID, uuid4

import boto3

from app.core.config import get_settings

settings = get_settings()


class StorageNotConfiguredError(RuntimeError):
    pass


class S3StorageService:
    def __init__(self) -> None:
        if not all(
            [
                settings.s3_bucket,
                settings.s3_access_key_id,
                settings.s3_secret_access_key,
            ]
        ):
            raise StorageNotConfiguredError("S3-compatible storage is not configured")

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )

    def build_case_key(
        self,
        *,
        tenant_id: UUID,
        repair_case_id: UUID,
        filename: str,
    ) -> str:
        suffix = Path(filename).suffix.lower()
        safe_suffix = suffix if len(suffix) <= 10 else ""
        return f"tenants/{tenant_id}/cases/{repair_case_id}/{uuid4()}{safe_suffix}"

    def create_upload_url(self, *, storage_key: str, mime_type: str) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": storage_key,
                "ContentType": mime_type,
            },
            ExpiresIn=settings.s3_signed_url_ttl_seconds,
        )

    def create_download_url(self, *, storage_key: str) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": storage_key},
            ExpiresIn=settings.s3_signed_url_ttl_seconds,
        )
