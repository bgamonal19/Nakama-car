from app.providers import carimage
from test_users import client  # noqa: F401  (pytest fixture)

from io import BytesIO
from PIL import Image
_b = BytesIO(); Image.new("RGB", (40, 20), "white").save(_b, "PNG"); PNG = _b.getvalue()


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
    assert first.status_code == 200 and first.headers["content-type"] == "image/webp"
    assert first.content[:4] == b"RIFF" and first.content[8:12] == b"WEBP"
    assert fake.calls == [("Fiat", "Panda", 2023, "white", "front"), ("Fiat", "Panda", None, "white", "front")]
    assert c.get("/api/v1/renders/car?" + params).content == first.content
    assert len(fake.calls) == 2
    # Another year of the same model, colour and view is served from the saved picture.
    assert c.get("/api/v1/renders/car?make=FIAT&model=panda&year=2021&view=front&color=bianco").status_code == 200
    assert len(fake.calls) == 2
    assert c.get("/api/v1/renders/car?make=Fiat&model=Unknown&view=side").status_code == 404
    assert c.get("/api/v1/renders/car?make=Fiat&model=Unknown&view=side").status_code == 404
    assert len(fake.calls) == 3
    assert c.get("/api/v1/renders/car?make=Fiat&model=Panda&view=inside").status_code == 422
    assert c.get("/api/v1/renders/car?make=Fiat&model=Panda&view=rear-3-4-right").status_code == 200
    info = c.get("/api/v1/renders/info?color=nero").json()
    assert info["configured"] is True and info["color"] == "black" and info["used_this_month"] == 3
    assert len(info["views"]) == 9


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


def test_crop_trims_antenna_and_halo_to_the_body():
    from io import BytesIO

    from PIL import Image, ImageDraw

    from app.providers.carimage import to_webp

    image = Image.new("RGBA", (1000, 800), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((200, 400, 800, 600), fill=(255, 255, 255, 255))
    draw.rectangle((600, 200, 603, 400), fill=(0, 0, 0, 255))  # roof antenna
    draw.rectangle((0, 0, 999, 799), outline=(0, 0, 0, 20), width=30)  # faint halo
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    content, mime = to_webp(buffer.getvalue(), "image/png")
    with Image.open(BytesIO(content)) as result:
        assert result.size == (649, 233)
    assert to_webp(content, "image/webp")[0] != b""
    assert mime.startswith("image/webp")


def test_registry_model_names_are_cleaned_for_the_catalog(client, monkeypatch):
    c, _, _ = client
    assert carimage.model_candidates("A3 Sportback (8VA, 8VF)") == ["A3 Sportback", "A3"]
    assert carimage.clean_model("Classe A (W177)") == "A-Class"
    assert carimage.clean_model("Serie 3 Touring") == "3 Series Touring"

    class OnlyBaseModel(FakeRenders):
        def render(self, *, make, model, year, color, view):
            self.calls.append((make, model, year, color, view))
            if model != "A3":
                raise carimage.RenderNotFound("no")
            return PNG, "image/png"

    fake = OnlyBaseModel()
    monkeypatch.setattr(carimage, "get_render_provider", lambda: fake)
    params = "make=Audi&model=A3%20Sportback%20(8VA%2C%208VF)&year=2013&view=side&color=Grigio"
    assert c.get("/api/v1/renders/car?" + params).status_code == 200
    assert [call[1:3] for call in fake.calls] == [("A3 Sportback", 2013), ("A3 Sportback", None), ("A3", 2013)]
    assert c.get("/api/v1/renders/car?" + params).status_code == 200
    assert len(fake.calls) == 3


def test_colour_names_fall_back_to_exact_paint():
    assert carimage.normalize_color("Azzurro") == "#3fa7d6"
    assert carimage.normalize_color("cyan") == "#3fa7d6"
    assert carimage.normalize_color("Giallo") == "yellow"

    class Provider(carimage.CarImageProvider):
        def __init__(self):
            super().__init__("key", "https://example.invalid")
            self.colors = []

        def _render(self, *, make, model, year, color, view):
            self.colors.append(color)
            if not color.startswith("#"):
                raise carimage.RenderNotFound("colour name not accepted")
            return PNG, "image/png"

    provider = Provider()
    assert provider.render(make="Fiat", model="Panda", year=None, color="purple", view="side")[0] == PNG
    assert provider.colors == ["purple", "#5b2a86"]


def test_plate_spot_saved_per_model_and_shown_to_customer(client):
    c, _, _ = client
    assert c.get("/api/v1/renders/plate-spots?make=Audi&model=A3").json() == {}
    saved = c.put("/api/v1/renders/plate-spots", json={
        "make": "Audi", "model": "A3 Sportback (8VA, 8VF)", "view": "front", "x": 0.5, "y": 0.71, "width": 0.3, "turn": 0,
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["front"] == {"x": 0.5, "y": 0.71, "width": 0.3, "turn": 0.0}
    # Same model written differently shares the position.
    assert c.get("/api/v1/renders/plate-spots?make=AUDI&model=A3%20Sportback").json()["front"]["y"] == 0.71
    assert c.put("/api/v1/renders/plate-spots", json={"make": "Audi", "model": "A3", "view": "side", "x": 0.5, "y": 0.5, "width": 0.3, "turn": 0}).status_code == 422

    customer = c.post("/api/v1/customers", json={"first_name": "Carlos"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "EX030XG", "customer_id": customer["id"], "make": "Audi", "model": "A3 Sportback (8VA, 8VF)"}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"]}).json()
    token = c.post(f"/api/v1/cases/{case['id']}/tracking-link").json()["public_token"]
    assert c.get(f"/api/v1/public/tracking/{token}").json()["vehicle"]["plate_spots"]["front"]["width"] == 0.3

    assert c.delete("/api/v1/renders/plate-spots?make=Audi&model=A3%20Sportback&view=front").json() == {}
