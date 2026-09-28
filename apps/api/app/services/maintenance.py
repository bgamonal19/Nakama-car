"""Next service of a vehicle, by date and by km, and how close it is."""
import calendar
from datetime import date

from app.models.garage import Vehicle

SOON_DAYS = 30
SOON_KM = 1500


def add_months(start: date, months: int) -> date:
    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def maintenance_status(vehicle: Vehicle, today: date | None = None) -> dict:
    today = today or date.today()
    next_date = vehicle.next_service_date
    if next_date is None and vehicle.last_service_date and vehicle.service_interval_months:
        next_date = add_months(vehicle.last_service_date, vehicle.service_interval_months)
    next_km = vehicle.next_service_km
    if next_km is None and vehicle.last_service_km is not None and vehicle.service_interval_km:
        next_km = vehicle.last_service_km + vehicle.service_interval_km
    days_left = (next_date - today).days if next_date else None
    km_left = next_km - vehicle.mileage if next_km is not None and vehicle.mileage is not None else None
    if days_left is None and next_km is None:
        state = "UNKNOWN"
    elif (days_left is not None and days_left <= 0) or (km_left is not None and km_left <= 0):
        state = "DUE"
    elif (days_left is not None and days_left <= SOON_DAYS) or (km_left is not None and km_left <= SOON_KM):
        state = "SOON"
    else:
        state = "OK"
    return {
        "service_interval_km": vehicle.service_interval_km,
        "service_interval_months": vehicle.service_interval_months,
        "last_service_date": vehicle.last_service_date,
        "last_service_km": vehicle.last_service_km,
        "next_service_date": next_date,
        "next_service_km": next_km,
        "days_left": days_left,
        "km_left": km_left,
        "state": state,
    }
