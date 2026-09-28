from io import BytesIO

from PIL import Image

from test_users import client  # noqa: F401  (pytest fixture)


def jpeg(size=(2400, 1200)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, "red").save(buffer, format="JPEG")
    return buffer.getvalue()


def test_photos_on_damage_markers_seen_by_customer(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"first_name": "Mario"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "GM267TJ", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"]}).json()
    base = f"/api/v1/cases/{case['id']}"
    marker = c.post(base + "/damage-markers", json={"view": "side", "x": 0.4, "y": 0.5, "operation": "REPAIR", "area_label": "Lato sinistro"}).json()

    uploaded = c.post(
        base + f"/media/direct?category=DAMAGE&damage_marker_id={marker['id']}&filename=graffio.jpg",
        content=jpeg(), headers={"Content-Type": "image/jpeg"},
    )
    assert uploaded.status_code == 201, uploaded.text
    photo = uploaded.json()
    assert photo["damage_marker_id"] == marker["id"] and photo["in_database"] is True
    assert photo["width"] == 1600 and photo["height"] == 800 and photo["mime_type"] == "image/webp"
    content = c.get(base + f"/media/{photo['id']}/content")
    assert content.status_code == 200 and content.content[8:12] == b"WEBP"

    front = c.post(base + "/media/direct?category=FRONT", content=jpeg((800, 600)), headers={"Content-Type": "image/jpeg"}).json()
    document = c.post(base + "/media/direct?category=DOCUMENT", content=jpeg((800, 600)), headers={"Content-Type": "image/jpeg"}).json()
    assert c.post(base + "/media/direct", content=b"not an image", headers={"Content-Type": "image/jpeg"}).status_code == 422
    assert c.post(base + "/media/direct?damage_marker_id=00000000-0000-0000-0000-000000000000", content=jpeg(), headers={"Content-Type": "image/jpeg"}).status_code == 404
    assert len(c.get(base + "/media").json()) == 3

    token = c.post(base + "/tracking-link").json()["public_token"]
    public = f"/api/v1/public/tracking/{token}"
    photos = c.get(public + "/photos").json()
    assert {p["id"] for p in photos} == {photo["id"], front["id"]}  # documents stay private
    assert next(p for p in photos if p["id"] == photo["id"])["damage_marker_id"] == marker["id"]
    assert c.get(public + f"/photos/{photo['id']}").status_code == 200
    assert c.get(public + f"/photos/{document['id']}").status_code == 404

    moved = c.patch(base + f"/media/{front['id']}", json={"damage_marker_id": marker["id"]})
    assert moved.json()["damage_marker_id"] == marker["id"]
    assert c.delete(base + f"/damage-markers/{marker['id']}").status_code == 204
    assert all(p["damage_marker_id"] is None for p in c.get(public + "/photos").json())
    assert c.delete(base + f"/media/{front['id']}").status_code == 204
    assert len(c.get(public + "/photos").json()) == 1
