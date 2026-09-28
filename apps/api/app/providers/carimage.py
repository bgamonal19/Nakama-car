"""carimage.dev studio renders (1 credit per image).

The API key stays on the server: the web app asks our API for a view and we
return the image bytes, cached per make/model/year/color/view so each render
is paid only once.
"""
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

PROVIDER_NAME = "carimage.dev"
logger = logging.getLogger(__name__)
# Turntable order: walking around the car, then the roof.
VIEWS = (
    "front", "front-3-4", "side", "rear-3-4", "rear", "rear-3-4-right", "side-right", "front-3-4-right", "top",
)
MAX_WIDTH = 1200
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


PROCESSED_MIME = "image/webp; v=4"


def is_processed(mime: str | None) -> bool:
    return mime == PROCESSED_MIME


def body_box(alpha) -> tuple[int, int, int, int] | None:
    """Box of the car body in an alpha channel.

    Faint shadows/halos are ignored and thin parts (roof antenna) are trimmed, so every
    view is cropped to the body itself and the car keeps the same scale while turning.
    """
    from PIL import Image

    mask = alpha.point(lambda value: 255 if value > 48 else 0)
    box = mask.getbbox()
    if not box:
        return None
    body = mask.crop(box)
    rows = list(body.resize((1, body.height), Image.BOX).getdata())
    cols = list(body.resize((body.width, 1), Image.BOX).getdata())

    def span(values: list[int], share: float) -> tuple[int, int]:
        limit = 255 * share
        start = next((i for i, value in enumerate(values) if value >= limit), 0)
        end = len(values) - next((i for i, value in enumerate(reversed(values)) if value >= limit), 0)
        return (start, end) if end > start else (0, len(values))

    top, bottom = span(rows, 0.06)
    left, right = span(cols, 0.03)
    return box[0] + left, box[1] + top, box[0] + right, box[1] + bottom


def to_webp(content: bytes, mime: str | None) -> tuple[bytes, str]:
    """Prepare a studio render for phones and handhelds.

    Transparent margins are cropped (keeping a small border) so the vehicle fills
    the damage map, the width is capped and the image is saved as WebP
    (PNG ~870 KB -> WebP ~40 KB). Stored with ``PROCESSED_MIME``.
    """
    if is_processed(mime):
        return content, mime
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(content)) as image:
            image.load()
            if image.mode in ("RGBA", "LA") or "transparency" in image.info:
                box = body_box(image.convert("RGBA").getchannel("A"))
                if box:
                    margin_x = round((box[2] - box[0]) * 0.04)
                    margin_y = round((box[3] - box[1]) * 0.08)
                    image = image.crop((
                        max(0, box[0] - margin_x), max(0, box[1] - margin_y),
                        min(image.width, box[2] + margin_x), min(image.height, box[3] + margin_y),
                    ))
            if image.width > MAX_WIDTH:
                image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)))
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA")
            output = BytesIO()
            image.save(output, format="WEBP", quality=82, method=4)
            return output.getvalue(), PROCESSED_MIME
    except Exception:  # noqa: BLE001 - an unreadable image is served as received
        logger.exception("WebP conversion failed, serving the original render")
        return content, mime or "application/octet-stream"


def webp_supported() -> bool:
    try:
        from PIL import features

        return bool(features.check("webp"))
    except Exception:  # noqa: BLE001
        return False


def clean_model(model: str) -> str:
    """Model name as the render catalog knows it.

    Registry data often carries chassis codes and Italian naming:
    "A3 Sportback (8VA, 8VF)" -> "A3 Sportback", "Classe A (W177)" -> "A-Class",
    "Serie 3 Touring" -> "3 Series Touring".
    """
    text = re.sub(r"\([^)]*\)", " ", model or "")
    text = re.sub(r"\s+", " ", text).strip(" -/,")
    classe = re.match(r"(?i)^classe\s+([a-z]{1,3})\b(.*)$", text)
    if classe:
        text = f"{classe.group(1).upper()}-Class{classe.group(2)}"
    serie = re.match(r"(?i)^serie\s+(\d)\b(.*)$", text)
    if serie:
        text = f"{serie.group(1)} Series{serie.group(2)}"
    return text.strip()


def model_candidates(model: str) -> list[str]:
    """Names to try in order: the cleaned model, then its base name (e.g. "A3")."""
    cleaned = clean_model(model)
    candidates = [cleaned] if cleaned else []
    base = cleaned.split(" ")[0] if cleaned else ""
    if base and base != cleaned and len(base) > 1 and not cleaned.endswith("-Class"):
        candidates.append(base)
    return candidates


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

    def __init__(self, api_key: str, url: str, timeout: float = 90):
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
            if exc.code in (400, 404, 422):
                # Unknown vehicle, or a view the catalog does not have for it.
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
