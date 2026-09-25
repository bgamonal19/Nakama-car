"""DATEV boundary. No document transport until the licensed contract is verified."""
from typing import Protocol
from urllib.parse import urlparse
import httpx
from app.core.config import DatevTenantConfig


class DatevError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class SBillProvider(Protocol):
    def check_connection(self) -> dict: ...
    def sync_customer(self, customer: dict, operation_key: str) -> str: ...
    def create_document(self, document: dict, operation_key: str) -> str: ...


class DatevSBillClient:
    def __init__(self, config: DatevTenantConfig | None):
        self.config = config

    def check_connection(self) -> dict:
        c = self.config
        if not c or not all((c.base_url, c.client_id, c.client_secret, c.authorization_key,
                             c.scope, c.client_credentials_confirmed)):
            raise DatevError("configuration_incomplete")
        for url in (c.base_url, c.token_url):
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise DatevError("invalid_https_configuration")
        # OAuth contract confirmed by developer.datev.it/Docs/Autenticazione.
        # This checks authentication only, not SBill permissions or tenant ownership.
        try:
            with httpx.Client(timeout=15, follow_redirects=False) as client:
                response = client.post(c.token_url, data={
                    "grant_type": "client_credentials", "client_id": c.client_id,
                    "client_secret": c.client_secret.get_secret_value(), "scope": c.scope,
                })
            if response.status_code != 200:
                raise DatevError("oauth_rejected")
            payload = response.json()
            token = payload.get("access_token") if isinstance(payload, dict) else None
            if not isinstance(token, str) or not token:
                raise DatevError("invalid_oauth_response")
        except (httpx.HTTPError, ValueError):
            raise DatevError("oauth_unavailable") from None
        return {"authentication": "ok", "sbill_connection": "unverified", "can_generate": False}

    def sync_customer(self, customer: dict, operation_key: str) -> str:
        raise DatevError("contract_unverified")

    def create_document(self, document: dict, operation_key: str) -> str:
        # Intentionally no env flag can bypass this gate. No SdI transport exists.
        raise DatevError("contract_unverified")
