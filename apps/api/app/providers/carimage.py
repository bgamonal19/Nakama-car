"""carimage.dev studio renders (1 credit per image).

The API key stays on the server: the web app asks our API for a view and we
return the image bytes, cached per make/model/year/color/view so each render
is paid only once.
"""
import json
import urllib.error
import urllib.parse
import urllib.request

PROVIDER_NAME = "carimage.dev"
VIEWS = ("front", "side", "side-right", "rear", "top")
PRESET_COLORS = {
    "silver", "red", "black", "white", "blue", "gray", "green", "orange", "purple",
    "brown", "gold", "beige", "pink", "yellow", "cyan",
}
ITALIAN_COLORS = [
    ("argent", "silver"), ("grigio", "gray"), ("antracite", "gray"), ("nero", "black"),
    ("bianc", "white"), ("rosso", "red"), ("bordeaux", "red"), ("blu", "blue"),
    ("azzurr", "cyan"), ("verde", "green"), ("arancio", "orange"), ("viola", "purple"),
    ("marrone", "brown"), ("bronzo", "brown"), ("oro", "gold"), ("beige", "beige"),
    ("sabbia", "beige"), ("rosa", "pink"), ("giallo", "yellow"),
    ("silver", "silver"), ("grey", "gray"), ("gray", "gray"), ("black", "black"), ("white", "white"),
    ("red", "red"), ("blue", "blue"), ("green", "green"),
]


class RenderError(RuntimeError):
    """The render service could not answer (credentials, credits, network)."""


class RenderNotFound(LookupError):
    """The vehicle is not in the render catalog."""


def normalize_color(value: str | None) -> str:
    text = (value or "").strip().lower()
    if not text:
        return "silver"
    if text in PRESET_COLORS:
        return text
    if text.startswith("#") and len(text) == 7:
        return text
    for keyword, color in ITALIAN_COLORS:
        if keyword in text:
            return color
    return "silver"


class CarImageProvider:
    name = PROVIDER_NAME

    def __init__(self, api_key: str, url: str, timeout: float = 30):
        self.api_key = api_key
        self.url = url
        self.timeout = timeout

    def _open(self, url: str, headers: dict):
        request = urllib.request.Request(url, headers=headers)
        return urllib.request.urlopen(request, timeout=self.timeout)

    def render(self, *, make: str, model: str, year: int | None, color: str, view: str) -> tuple[bytes, str]:
        params = {"make": make, "model": model, "view": view, "color": color}
        if year:
            params["year"] = str(year)
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "image/webp,image/png,image/*,application/json"}
        try:
            with self._open(f"{self.url}?{urllib.parse.urlencode(params)}", headers) as response:
                content_type = response.headers.get("Content-Type", "")
                body = response.read()
        except urllib.error.HTTPError as exc:
            if exc.code in (404, 422):
                raise RenderNotFound(f"{make} {model} not in catalog") from exc
            if exc.code in (401, 403):
                raise RenderError("Render service key not valid") from exc
            if exc.code == 402:
                raise RenderError("No credits left on the render account") from exc
            raise RenderError(f"Render service error ({exc.code})") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RenderError("Render service not reachable") from exc

        if content_type.startswith("image/"):
            return body, content_type.split(";")[0]
        # Some deployments answer with JSON pointing to a signed image URL.
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RenderError("Unexpected answer from render service") from exc
        payload = data.get("data", data) if isinstance(data, dict) else {}
        image_url = payload.get("url") or payload.get("image_url") or payload.get("signed_url")
        if not image_url:
            raise RenderNotFound(f"{make} {model} not in catalog")
        try:
            with self._open(image_url, {"Accept": "image/*"}) as response:
                return response.read(), response.headers.get("Content-Type", "image/webp").split(";")[0]
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RenderError("Render image not reachable") from exc


def get_render_provider():
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.car_image_api_key:
        return None
    return CarImageProvider(settings.car_image_api_key, settings.car_image_api_url, settings.car_image_timeout_seconds)
