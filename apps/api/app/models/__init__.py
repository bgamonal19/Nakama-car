from app.models.garage import Customer, RepairCase, Vehicle
from app.models.identity import AuditLog, Permission, Role, RolePermission, Tenant, TenantSettings, User, UserRole, UserTenant
from app.models.media import Media

__all__ = [
    "AuditLog", "Permission", "Role", "RolePermission", "Tenant", "TenantSettings",
    "User", "UserRole", "UserTenant", "Customer", "Vehicle", "RepairCase", "Media"
]
