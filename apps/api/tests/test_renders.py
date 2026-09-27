from app.providers import carimage
from test_users import client  # noqa: F401  (pytest fixture)

PNG = b"\x89PNG\r\n\x1a\nfake"


class FakeRenders:
    name = "carimage.dev"

    def __init__(self):
        self.calls = []

    def render(self, *, make, model, year, color, view):
        self.calls.append((make, model, year, color, view))
        if model == "Unknown":
            raise carimage.RenderNotFound("no")
        if year == 2023:
            raise carimage.RenderNotFound("year not in catalog")
        return PNG, "image/png"


def test_render_is_paid_once_and_falls_back_without_year(client, monkeypatch):
    c, _, _ = client
    params = "make=Fiat&model=Panda&year=2023&view=front&color=Bianco"
    assert c.get("/api/v1/renders/car?" + params).status_code == 503
    fake = FakeRenders()
    monkeypatch.setattr(carimage, "get_render_provider", lambda: fake)
    first = c.get("/api/v1/renders/car?" + params)
    assert first.status_code == 200 and first.content == PNG and first.headers["content-type"] == "image/png"
    assert fake.calls == [("Fiat", "Panda", 2023, "white", "front"), ("Fiat", "Panda", None, "white", "front")]
    assert c.get("/api/v1/renders/car?" + params).content == PNG
    assert len(fake.calls) == 2
    assert c.get("/api/v1/renders/car?make=Fiat&model=Unknown&view=side").status_code == 404
    assert c.get("/api/v1/renders/car?make=Fiat&model=Unknown&view=side").status_code == 404
    assert len(fake.calls) == 3
    assert c.get("/api/v1/renders/car?make=Fiat&model=Panda&view=inside").status_code == 422
    info = c.get("/api/v1/renders/info?color=nero").json()
    assert info["configured"] is True and info["color"] == "black" and info["used_this_month"] == 2


def test_damage_markers_on_a_case(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"first_name": "Mario"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "GM267TJ", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"]}).json()
    path = f"/api/v1/cases/{case['id']}/damage-markers"
    created = c.post(path, json={"view": "side", "x": 0.42, "y": 0.6, "operation": "PAINT", "area_label": "Lato sinistro · centro"})
    assert created.status_code == 201, created.text
    assert c.post(path, json={"view": "side", "x": 1.4, "y": 0.6, "operation": "PAINT", "area_label": "x"}).status_code == 422
    assert c.post(path, json={"view": "side", "x": 0.4, "y": 0.6, "operation": "NO_DAMAGE", "area_label": "x"}).status_code == 422
    assert [m["operation"] for m in c.get(path).json()] == ["PAINT"]
    assert c.delete(f"{path}/{created.json()['id']}").status_code == 204
    assert c.get(path).json() == []
