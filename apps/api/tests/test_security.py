import uuid

from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token
from jose import jwt

from app.core.config import get_settings


def test_password_hash_and_verify():
    password = "Nakama-Secure-123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(hashed, password)
    assert not verify_password(hashed, "wrong-password")


def test_access_token_contains_tenant_and_permissions():
    settings = get_settings()
    user_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    token = create_access_token(
        user_id=user_id,
        tenant_id=tenant_id,
        permissions=["case.read", "estimate.read"],
    )
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])

    assert payload["sub"] == str(user_id)
    assert payload["tenant_id"] == str(tenant_id)
    assert payload["permissions"] == ["case.read", "estimate.read"]
    assert payload["type"] == "access"
