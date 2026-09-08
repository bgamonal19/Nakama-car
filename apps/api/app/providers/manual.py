from app.providers.contracts import (
    LaborTimesProvider,
    PartsProvider,
    ProviderLaborOperation,
    ProviderPart,
    ProviderVehicle,
    RepairCalculationProvider,
    VehicleDataProvider,
)


class ManualVehicleDataProvider(VehicleDataProvider):
    def find_by_vin(self, vin: str) -> ProviderVehicle | None:
        return None

    def find_by_plate(self, license_plate: str, country: str = "IT") -> ProviderVehicle | None:
        return None


class ManualPartsProvider(PartsProvider):
    def search_parts(self, vehicle_external_id: str, query: str) -> list[ProviderPart]:
        return []


class ManualLaborTimesProvider(LaborTimesProvider):
    def get_operations(
        self, vehicle_external_id: str, vehicle_area: str
    ) -> list[ProviderLaborOperation]:
        return []


class ManualRepairCalculationProvider(RepairCalculationProvider):
    def calculate(self, payload: dict) -> dict:
        return {
            "source": "manual",
            "status": "requires_user_input",
            "result": None,
        }
