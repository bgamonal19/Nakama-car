"""targa.co.it (RegCheck) plate lookup for Italian vehicles.

The service is an ASP.NET ASMX web service; the HTTP GET binding of the
``CheckItaly`` operation returns an XML document whose ``vehicleJson`` element
holds the vehicle data as JSON. One credit is charged per successful lookup.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

from app.providers.contracts import ProviderVehicle, VehicleDataProvider

PROVIDER_NAME = "targa.co.it"


class PlateLookupError(RuntimeError):
    """The provider could not answer (credentials, credit, network)."""


def _text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("CurrentTextValue") or value.get("CurrentValue") or value.get("Value")
    text = str(value).strip() if value is not None else ""
    return text or None


def _int(value) -> int | None:
    match = re.search(r"\d+", _text(value) or "")
    return int(match.group()) if match else None


def parse_vehicle(plate: str, data: dict) -> ProviderVehicle:
    make = _text(data.get("CarMake")) or _text(data.get("MakeDescription"))
    model = _text(data.get("CarModel")) or _text(data.get("ModelDescription"))
    year = _int(data.get("RegistrationYear"))
    return ProviderVehicle(
        external_id=_text(data.get("KType")),
        make=make.title() if make and make.isupper() else make,
        model=model,
        version=_text(data.get("Version")) or _text(data.get("Description")),
        year=year if year and 1886 <= year <= 2100 else None,
        vin=_text(data.get("VechileIdentificationNumber")) or _text(data.get("Vin")),
        license_plate=plate,
        raw=data,
        fuel_type=_text(data.get("FuelType")),
        engine_size=_text(data.get("EngineSize")),
        power_kw=_int(data.get("PowerKW")),
        doors=_int(data.get("NumberOfDoors")),
        image_url=_text(data.get("ImageUrl")),
    )


def parse_response(plate: str, body: bytes) -> ProviderVehicle | None:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise PlateLookupError("Invalid response from plate lookup service") from exc
    for element in root.iter():
        if element.tag.split("}")[-1] == "vehicleJson" and element.text and element.text.strip():
            try:
                return parse_vehicle(plate, json.loads(element.text))
            except json.JSONDecodeError as exc:
                raise PlateLookupError("Invalid vehicle data from plate lookup service") from exc
    return None


class TargaVehicleDataProvider(VehicleDataProvider):
    name = PROVIDER_NAME

    def __init__(self, username: str, url: str, timeout: float = 15):
        self.username = username
        self.url = url
        self.timeout = timeout

    def find_by_vin(self, vin: str) -> ProviderVehicle | None:
        return None

    def find_by_plate(self, license_plate: str, country: str = "IT") -> ProviderVehicle | None:
        query = urllib.parse.urlencode({"RegistrationNumber": license_plate, "username": self.username})
        request = urllib.request.Request(f"{self.url}?{query}", headers={"Accept": "text/xml"})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:500].lower()
            # ASMX returns 500 with the exception text: "No vehicle found" for unknown plates.
            if "no vehicle" in detail or "not found" in detail or "invalid registration" in detail:
                return None
            if "credit" in detail:
                raise PlateLookupError("No credits left on the plate lookup account") from exc
            if "username" in detail or "authori" in detail or "blocked" in detail:
                raise PlateLookupError("Plate lookup account not valid") from exc
            raise PlateLookupError(f"Plate lookup service error ({exc.code})") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise PlateLookupError("Plate lookup service not reachable") from exc
        return parse_response(license_plate, body)


def get_vehicle_data_provider():
    """The configured plate provider, or None when no account is set."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.targa_api_username:
        return None
    return TargaVehicleDataProvider(
        username=settings.targa_api_username,
        url=settings.targa_api_url,
        timeout=settings.targa_api_timeout_seconds,
    )
