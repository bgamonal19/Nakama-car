import json

from app.providers import targa
from app.providers.contracts import ProviderVehicle
from test_users import client  # noqa: F401  (pytest fixture)

SAMPLE = {
    "Description": "FIAT PANDA 1.2",
    "RegistrationYear": "2015",
    "CarMake": {"CurrentTextValue": "FIAT"},
    "CarModel": {"CurrentTextValue": "PANDA"},
    "EngineSize": {"CurrentTextValue": "1242"},
    "FuelType": {"CurrentTextValue": "Benzina"},
    "NumberOfDoors": {"CurrentTextValue": "5"},
    "Version": "1.2 Easy",
    "PowerKW": 51,
    "VechileIdentificationNumber": "ZFA31200000123456",
}


def test_parse_regcheck_xml_response():
    body = (
        '<?xml version="1.0" encoding="utf-8"?><Vehicle xmlns="http://regcheck.org.uk">'
        "<vehicleJson>" + json.dumps(SAMPLE).replace("&", "&amp;").replace("<", "&lt;") + "</vehicleJson>"
        "<vehicleData /></Vehicle>"
    ).encode()
    vehicle = targa.parse_response("AB123CD", body)
    assert vehicle.make == "Fiat"
    assert vehicle.model == "PANDA"
    assert vehicle.version == "1.2 Easy"
    assert vehicle.year == 2015
    assert vehicle.fuel_type == "Benzina"
    assert vehicle.engine_size == "1242"
    assert vehicle.power_kw == 51
    assert vehicle.doors == 5
    assert vehicle.vin == "ZFA31200000123456"
    assert targa.parse_response("AB123CD", b"<Vehicle><vehicleJson></vehicleJson></Vehicle>") is None


class FakeProvider:
    name = "targa.co.it"

    def __init__(self):
        self.calls = 0

    def find_by_plate(self, plate, country="IT"):
        self.calls += 1
        if plate == "ZZ999ZZ":
            return None
        return targa.parse_vehicle(plate, SAMPLE)


def test_plate_lookup_is_cached_and_limited(client, monkeypatch):
    c, _, _ = client
    assert c.get("/api/v1/vehicles/plate-data/AB123CD").status_code == 503

    fake = FakeProvider()
    monkeypatch.setattr(targa, "get_vehicle_data_provider", lambda: fake)
    first = c.get("/api/v1/vehicles/plate-data/ab 123 cd")
    assert first.status_code == 200, first.text
    data = first.json()
    assert data["license_plate"] == "AB123CD" and data["make"] == "Fiat" and data["cached"] is False
    second = c.get("/api/v1/vehicles/plate-data/AB123CD").json()
    assert second["cached"] is True and second["model"] == "PANDA"
    assert fake.calls == 1

    assert c.get("/api/v1/vehicles/plate-data/ZZ999ZZ").status_code == 404
    assert c.get("/api/v1/vehicles/plate-data/ZZ999ZZ").status_code == 404
    assert fake.calls == 2
    assert c.get("/api/v1/vehicles/plate-data/X1").status_code == 422

    usage = c.get("/api/v1/settings/company/plate-lookup").json()
    assert usage == {"configured": True, "provider": "targa.co.it", "used_this_month": 2, "monthly_limit": 300}

    from app.api.v1 import vehicles
    monkeypatch.setattr(vehicles, "monthly_lookups", lambda db, tenant: 10_000)
    assert c.get("/api/v1/vehicles/plate-data/CD456EF").status_code == 429


def test_vehicle_stores_technical_data(client):
    c, _, _ = client
    created = c.post("/api/v1/vehicles", json={
        "license_plate": "AB123CD", "make": "Fiat", "fuel_type": "Benzina", "engine_size": "1242", "power_kw": 51,
    })
    assert created.status_code == 201, created.text
    assert created.json()["fuel_type"] == "Benzina" and created.json()["power_kw"] == 51


def test_provider_vehicle_defaults_keep_manual_provider_working():
    vehicle = ProviderVehicle(external_id=None, make="Fiat", model=None, version=None, year=None, vin=None, license_plate="AB123CD")
    assert vehicle.fuel_type is None and vehicle.power_kw is None


def test_fuel_engine_and_power_are_read_from_the_version_text():
    vehicle = targa.parse_vehicle("GM267TJ", {
        "CarMake": {"CurrentTextValue": "FIAT"}, "CarModel": {"CurrentTextValue": "Panda"},
        "Version": "Panda 1.0 firefly hybrid s&s 70cv 5p.ti", "RegistrationYear": "2023", "PowerKW": 0,
    })
    assert (vehicle.fuel_type, vehicle.engine_size, vehicle.power_kw) == ("Ibrida", "1.0 L", 51)
    assert targa.infer_from_description("Ducato 35 2.3 MJT 140CV") == {"fuel_type": "Diesel", "engine_size": "2.3 L", "power_kw": 103}
    assert targa.enrich({"power_kw": 0})["power_kw"] is None
