# RBAC and tenant authorization

Initial roles: ADMIN, RECEPTION, BODYSHOP, PAINTER, MECHANIC, ACCOUNTING.

Authorization is permission-based internally. Example permission codes include customer.read, customer.write, vehicle.read, vehicle.write, case.create, case.read, estimate.create, estimate.change_price, estimate.change_discount, estimate.approve, work_order.update_status, invoice.create, settings.manage, users.manage and audit.read.

The selected tenant and effective permission codes are carried in the access context. Server-side authorization is authoritative; frontend checks are UX only.

## Isolation rule

A valid user ID is not sufficient. Every business request must resolve a valid tenant membership and every tenant-owned query must be scoped to that tenant. Cross-tenant identifiers must never leak foreign data.
