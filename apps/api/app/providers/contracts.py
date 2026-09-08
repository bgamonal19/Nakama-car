from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(slots=True)
class ProviderVehicle:
    external_id: str | None
    make: str | None
    model: str | None
    version: str | None
    year: int | None
    vin: str | None
    license_plate: str | None
    raw: dict[str, Any] | None = None


@dataclass(slots=True)
class ProviderPart:
    external_id: str | None
    oem_code: str | None
    description: str
    list_price: Decimal | None
    currency: str | None


@dataclass(slots=True)
class ProviderLaborOperation:
    external_id: str | None
    description: str
    hours: Decimal | None


class VehicleDataProvider(ABC):
    @abstractmethod
    def find_by_vin(self, vin: str) -> ProviderVehicle | None: ...

    @abstractmethod
    def find_by_plate(self, license_plate: str, country: str = "IT") -> ProviderVehicle | None: ...


class PartsProvider(ABC):
    @abstractmethod
    def search_parts(self, vehicle_external_id: str, query: str) -> list[ProviderPart]: ...


class LaborTimesProvider(ABC):
    @abstractmethod
    def get_operations(
        self, vehicle_external_id: str, vehicle_area: str
    ) -> list[ProviderLaborOperation]: ...


class RepairCalculationProvider(ABC):
    @abstractmethod
    def calculate(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class DamageAnalysisService(ABC):
    @abstractmethod
    def analyze(self, image_refs: list[str], vehicle: dict[str, Any]) -> list[dict[str, Any]]: ...
