from io import BytesIO

from PIL import Image

from test_portal import portal_client
from test_users import client  # noqa: F401  (pytest fixture)


def png(size=(1200, 600)) -> bytes:
    buffer = BytesIO()
    Image.new("RGBA", size, (200, 0, 0, 128)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_customer_logo_on_record_and_in_portal(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"customer_type": "COMPANY", "company_name": "Gamonal Trasporti"}).json()
    base = f"/api/v1/customers/{customer['id']}"
    assert customer["logo_updated_at"] is None
    assert c.get(base + "/logo").status_code == 404

    refused = c.put(base + "/logo", content=b"not an image", headers={"Content-Type": "application/octet-stream"})
    assert refused.status_code == 422

    saved = c.put(base + "/logo", content=png(), headers={"Content-Type": "application/octet-stream"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["logo_updated_at"]
    assert any(item["id"] == customer["id"] and item["logo_updated_at"] for item in c.get("/api/v1/customers").json())

    logo = c.get(base + "/logo")
    assert logo.status_code == 200 and logo.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(logo.content)) as image:
        assert max(image.size) == 512 and image.mode == "RGBA"

    # Editing the record keeps the logo.
    assert c.patch(base, json={"phone": "3923875686"}).json()["logo_updated_at"]

    portal = portal_client(c, customer)
    assert portal.get("/api/v1/portal/profile").json()["customer"]["logo_updated_at"]
    assert portal.get("/api/v1/portal/me").json()["customer_logo_updated_at"]
    assert portal.get("/api/v1/portal/logo").content == logo.content

    removed = c.delete(base + "/logo")
    assert removed.status_code == 200 and removed.json()["logo_updated_at"] is None
    assert c.get(base + "/logo").status_code == 404
    assert portal.get("/api/v1/portal/logo").status_code == 404
