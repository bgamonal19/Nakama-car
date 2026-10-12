"""Workshop photos kept in the database: straightened, resized and saved as WebP."""
from io import BytesIO

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_SIDE = 1600


class PhotoError(ValueError):
    pass


def prepare_photo(content: bytes) -> tuple[bytes, int, int]:
    if not content:
        raise PhotoError("File vuoto.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise PhotoError("Foto troppo grande (max 15 MB).")
    try:
        from PIL import Image, ImageOps

        with Image.open(BytesIO(content)) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")
            output = BytesIO()
            image.save(output, format="WEBP", quality=80, method=4)
            return output.getvalue(), image.width, image.height
    except PhotoError:
        raise
    except Exception as exc:  # noqa: BLE001 - anything unreadable is not a photo
        raise PhotoError("Il file non è un'immagine valida.") from exc
