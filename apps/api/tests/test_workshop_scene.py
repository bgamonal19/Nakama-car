from datetime import date, datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from test_users import client
from app.models.identity import Tenant
from app.models.garage import Vehicle, RepairCase, Customer
from app.api.v1.workshop_scene import day_bounds


def make_scene_case(c, plate="SCENE01"):
    customer = c.post('/api/v1/customers', json={'first_name':'Scene'}).json()
    vehicle = c.post('/api/v1/vehicles', json={'customer_id':customer['id'], 'license_plate':plate,
        'make':'Fiat','model':'Ducato','vehicle_category':'VAN','color_name':'Bianco'}).json()
    case = c.post('/api/v1/cases', json={'customer_id':customer['id'],'vehicle_id':vehicle['id'],'work_type':'MECHANICAL'}).json()
    order = c.post('/api/v1/work-orders', json={'repair_case_id':case['id']}).json()
    return vehicle,case,order


def test_snapshot_real_data_status_events_and_no_customer_notes(client):
    c,_,_=client
    vehicle,case,order=make_scene_case(c)
    for state in ['IN_REPAIR','WAITING_PARTS','READY','DELIVERED']:
        response=c.patch('/api/v1/work-orders/'+order['id']+'/status',json={'status':state})
        assert response.status_code==200
    response=c.get('/api/v1/workshop-scene')
    assert response.status_code==200
    data=response.json()
    assert data['positions_are_illustrative']
    item=data['vehicles'][0]
    assert item['plate']==vehicle['license_plate'] and item['model']=='Ducato'
    assert item['status']=='DELIVERED'
    assert 'customer_id' not in item and 'internal_notes' not in item
    assert [e['after'] for e in data['events'] if e['kind']=='status']==['IN_REPAIR','WAITING_PARTS','READY','DELIVERED']
    assert data['events'][0]['kind']=='opened'


def test_no_demo_data_and_tenant_isolation(client):
    c,engine,_=client
    assert c.get('/api/v1/workshop-scene').json()['vehicles']==[]
    with Session(engine) as db:
        tenant=Tenant(name='Foreign',slug='foreign-scene');db.add(tenant);db.flush()
        customer=Customer(tenant_id=tenant.id,first_name='Secret');db.add(customer);db.flush()
        vehicle=Vehicle(tenant_id=tenant.id,license_plate='SECRET');db.add(vehicle);db.flush()
        db.add(RepairCase(tenant_id=tenant.id,vehicle_id=vehicle.id,customer_id=customer.id,case_number='SECRET',work_type='MECHANICAL'));db.commit()
    assert c.get('/api/v1/workshop-scene').json()['vehicles']==[]
    c.headers.pop('Authorization')
    assert c.get('/api/v1/workshop-scene').status_code==401


def test_dst_day_boundaries():
    start,end=day_bounds(date(2026,10,25))
    assert (end-start).total_seconds()==25*3600
    start,end=day_bounds(date(2026,3,29))
    assert (end-start).total_seconds()==23*3600


def test_task_events_and_future_date(client):
    c,_,_=client
    _,case,order=make_scene_case(c)
    task=c.post('/api/v1/work-orders/'+order['id']+'/tasks',json={'task_type':'DIAGNOSTIC','description':'Diagnosis','sort_order':0}).json()
    assert c.patch(f"/api/v1/work-orders/{order['id']}/tasks/{task['id']}/status",json={'status':'DONE'}).status_code==200
    data=c.get('/api/v1/workshop-scene').json()
    assert any(e['kind']=='task' and e['case_id']==case['id'] and e['after']=='DONE' for e in data['events'])
    assert c.get('/api/v1/workshop-scene?day=2100-01-01').status_code==422


def test_scene_permission_and_worker_area(client):
    c,_,_=client
    make_scene_case(c)
    for role,expected in [('MECHANIC',200),('BODYSHOP',403),('ACCOUNTING',403)]:
        # Retain the original administrator session for staff creation.
        admin=c.headers['Authorization']
        email=role.lower()+'-scene@example.com'
        assert c.post('/api/v1/users',json={'email':email,'password':'SceneTest2026!','first_name':'Test','last_name':'Worker','role_code':role}).status_code==201
        login=c.post('/api/v1/auth/login',json={'email':email,'password':'SceneTest2026!'})
        c.headers['Authorization']='Bearer '+login.json()['access_token']
        assert c.get('/api/v1/workshop-scene').status_code==expected
        c.headers['Authorization']=admin
