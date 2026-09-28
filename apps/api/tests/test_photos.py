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


def test_photo_of_the_part_linked_to_the_estimate_line(client):
    import test_fleet_billing as fleet

    c, _, _ = client
    _, _, _, case = fleet.create_fleet_case(c, plate="PH123OT")
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    line = c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=fleet.mechanical_line(description="Pastiglie freno anteriori")).json()
    base = f"/api/v1/cases/{case['id']}"

    photo = c.post(base + f"/media/direct?category=OTHER&estimate_line_id={line['id']}", content=jpeg((800, 600)), headers={"Content-Type": "image/jpeg"})
    assert photo.status_code == 201, photo.text
    assert photo.json()["estimate_line_id"] == line["id"]
    wrong = c.post(base + "/media/direct?estimate_line_id=00000000-0000-0000-0000-000000000000", content=jpeg((80, 60)), headers={"Content-Type": "image/jpeg"})
    assert wrong.status_code == 404

    token = c.post(base + "/tracking-link").json()["public_token"]
    photos = c.get(f"/api/v1/public/tracking/{token}/photos").json()
    assert photos[0]["estimate_line_id"] == line["id"]
    unlinked = c.patch(base + f"/media/{photo.json()['id']}", json={"estimate_line_id": None}).json()
    assert unlinked["estimate_line_id"] is None
