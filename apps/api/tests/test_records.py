from uuid import UUID

from sqlalchemy.orm import Session

from test_users import client
from app.models.identity import Tenant, AuditLog
from app.models.garage import Customer, Vehicle, RepairCase, RepairCaseStatus
from sqlalchemy import select


def make_records(c):
    customer = c.post('/api/v1/customers', json={'first_name': 'Mario', 'last_name': 'Rossi'}).json()
    vehicle = c.post('/api/v1/vehicles', json={'license_plate': 'AB123CD', 'customer_id': customer['id']}).json()
    case = c.post('/api/v1/cases', json={'customer_id': customer['id'], 'vehicle_id': vehicle['id'], 'mileage': 0}).json()
    return customer, vehicle, case


def test_empty_dashboard_has_no_sample_counts(client):
    c, _, _ = client
    data = c.get('/api/v1/dashboard/summary').json()
    for key in ('open_cases','waiting_approval','in_progress','waiting_parts','ready'):
        assert data[key] == 0
    assert data['recent_practices'] == []


def test_search_pagination_and_edit_preserve_records(client):
    c, _, _ = client
    customer, vehicle, case = make_records(c)
    c.post('/api/v1/customers', json={'company_name': 'Other company', 'customer_type': 'COMPANY'})
    assert len(c.get('/api/v1/customers?limit=1').json()) == 1
    assert len(c.get('/api/v1/customers?offset=1&limit=1').json()) == 1
    assert c.get('/api/v1/customers?q=mario').json()[0]['id'] == customer['id']
    assert c.get('/api/v1/customers?q=%25').json() == []
    assert c.get('/api/v1/customers?offset=-1').status_code == 422
    assert c.patch('/api/v1/customers/'+customer['id'],json={'phone':'12345'}).status_code == 200
    assert c.patch('/api/v1/customers/'+customer['id'],json={'first_name':None,'last_name':None}).status_code == 422
    assert c.patch('/api/v1/customers/'+customer['id'],json={'country':None}).status_code == 422
    assert c.get('/api/v1/customers/'+customer['id']).json()['first_name'] == 'Mario'
    assert c.get('/api/v1/vehicles?q=ab123').json()[0]['id'] == vehicle['id']
    assert c.get('/api/v1/cases?q=AB123').json()[0]['id'] == case['id']
    assert c.get('/api/v1/cases?customer_id='+customer['id']).json()[0]['id'] == case['id']
    assert c.get('/api/v1/cases?vehicle_id='+vehicle['id']).json()[0]['id'] == case['id']


def test_case_notes_validation_audit_and_waiting_parts(client):
    c, engine, _ = client
    customer, vehicle, case = make_records(c)
    path = '/api/v1/cases/'+case['id']
    assert c.get(path).json()['mileage'] == 0
    assert c.patch(path,json={'mileage':-1}).status_code == 422
    assert c.patch(path,json={'fuel_level_percent':101}).status_code == 422
    assert c.patch(path,json={'status':'INVOICED'}).status_code == 422
    response = c.patch(path,json={'customer_notes':'Repair door','fuel_level_percent':0})
    assert response.status_code == 200
    assert c.get(path).json()['customer_notes'] == 'Repair door'
    with Session(engine) as db:
        audit = db.scalar(select(AuditLog).where(AuditLog.entity_id == UUID(case['id']), AuditLog.action == 'updated'))
        assert audit.new_value['customer_notes'] == 'Repair door'
        record = db.get(RepairCase,UUID(case['id']))
        record.status = RepairCaseStatus.WAITING_PARTS
        db.commit()
    summary = c.get('/api/v1/dashboard/summary').json()
    assert summary['waiting_parts'] == 1
    assert summary['open_cases'] == 1


def test_records_are_tenant_scoped(client):
    c, engine, _ = client
    with Session(engine) as db:
        tenant = Tenant(name='Other garage',slug='foreign-records')
        db.add(tenant);db.flush()
        customer = Customer(tenant_id=tenant.id,first_name='Secret')
        db.add(customer);db.flush()
        vehicle = Vehicle(tenant_id=tenant.id,customer_id=customer.id,license_plate='SECRET')
        db.add(vehicle);db.flush()
        case = RepairCase(tenant_id=tenant.id,customer_id=customer.id,vehicle_id=vehicle.id,case_number='SECRET-CASE')
        db.add(case);db.commit()
        cid,vid,rid = str(customer.id),str(vehicle.id),str(case.id)
    assert c.get('/api/v1/customers?q=Secret').json() == []
    assert c.get('/api/v1/vehicles?q=SECRET').json() == []
    assert c.get('/api/v1/cases?customer_id='+cid).json() == []
    assert c.get('/api/v1/cases?vehicle_id='+vid).json() == []
    assert c.get('/api/v1/cases/'+rid).status_code == 404
    assert c.patch('/api/v1/cases/'+rid,json={'customer_notes':'no'}).status_code == 404


def test_case_edit_permission_denied_for_accounting(client):
    c, _, _ = client
    _, _, case = make_records(c)
    response = c.post('/api/v1/users', json={'email':'accountant@example.com','password':'Accountant2026!','first_name':'A','last_name':'B','role_code':'ACCOUNTING'})
    assert response.status_code == 201
    login = c.post('/api/v1/auth/login',json={'email':'accountant@example.com','password':'Accountant2026!'})
    c.headers['Authorization'] = 'Bearer '+login.json()['access_token']
    assert c.patch('/api/v1/cases/'+case['id'],json={'internal_notes':'no'}).status_code == 403
