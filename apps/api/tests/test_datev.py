from decimal import Decimal
from uuid import UUID, uuid4
import json
import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from test_users import client
from test_records import make_records
from app.core.config import DatevTenantConfig, get_settings
from app.models.billing import Invoice, InvoiceLine
from app.models.datev import DatevLink
from app.models.estimating import Estimate, EstimateStatus
from app.models.garage import Customer, RepairCase, RepairCaseStatus
from app.models.identity import AuditLog
from app.providers.datev import DatevSBillClient, DatevError


def invoice_fixture(client, monkeypatch):
    c, engine, tenant = client
    customer, _, case = make_records(c)
    with Session(engine) as db:
        person = db.get(Customer, UUID(customer['id']))
        person.tax_code = 'TEST-FISCAL-ID'
        person.address = 'Via Test 1'; person.city = 'Roma'; person.postal_code = '00100'
        db.get(RepairCase, UUID(case['id'])).status = RepairCaseStatus.READY
        estimate = Estimate(tenant_id=UUID(tenant), repair_case_id=UUID(case['id']),
                            estimate_number='TEST-ESTIMATE', status=EstimateStatus.APPROVED)
        db.add(estimate); db.flush()
        invoice = Invoice(tenant_id=UUID(tenant), repair_case_id=UUID(case['id']), estimate_id=estimate.id,
                          invoice_number='TEST-INVOICE', subtotal=100, vat_total=22, total=122)
        db.add(invoice); db.flush()
        db.add(InvoiceLine(tenant_id=UUID(tenant), invoice_id=invoice.id, source_category='PART',
                           description='Ricambio', quantity=1, unit_price=100, vat_rate=22,
                           line_subtotal=100, line_vat=22, line_total=122))
        db.commit(); iid = str(invoice.id)
    monkeypatch.setattr(get_settings(), 'datev_tenants', {tenant: DatevTenantConfig(
        payment_method_id='test-method', payment_type_id='test-type', vat_codes={'22.00': 'test-vat'})})
    return iid, customer['id']


def test_prepare_idempotent_mapping_and_no_emission(client, monkeypatch):
    iid, _ = invoice_fixture(client, monkeypatch)
    c, engine, tenant = client
    path = f'/api/v1/datev/invoices/{iid}'
    assert c.get(path).json()['can_prepare'] is True
    first = c.post(path+'/prepare').json()
    second = c.post(path+'/prepare').json()
    assert first['operation_id'] == second['operation_id']
    assert first['document']['lines'][0]['category'] == 'PART'
    assert first['document']['lines'][0]['vat_code_id'] == 'test-vat'
    assert first['document']['customer']['tax_code'] == 'TEST-FISCAL-ID'
    assert first['document']['references']['license_plate'] == 'AB123CD'
    assert first['can_generate'] is False
    assert c.post(path+'/create').status_code == 409
    with Session(engine) as db:
        assert db.scalar(select(func.count(DatevLink.id))) == 1
        assert db.get(Invoice, UUID(iid)).status.value == 'DRAFT'
        logs = db.scalars(select(AuditLog).where(AuditLog.entity_type == 'datev')).all()
        assert len([log for log in logs if log.action == 'prepared']) == 1
        assert 'TEST-FISCAL-ID' not in str([log.new_value for log in logs])
        line = db.scalar(select(InvoiceLine)); line.description = 'Changed'; db.commit()
    assert c.post(path+'/prepare').status_code == 409


def test_readiness_missing_data_and_legacy_lines(client, monkeypatch):
    iid, _ = invoice_fixture(client, monkeypatch)
    c, engine, tenant = client
    monkeypatch.setattr(get_settings(), 'datev_tenants', {})
    with Session(engine) as db:
        db.scalar(select(InvoiceLine)).source_category = None
        db.scalar(select(Customer)).tax_code = None
        db.commit()
    result = c.post(f'/api/v1/datev/invoices/{iid}/prepare').json()
    assert result['status'] == 'incomplete'
    assert 'vat_code.22.00' in result['missing_fields']
    assert 'customer.vat_number_or_tax_code' in result['missing_fields']
    with Session(engine) as db:
        assert db.scalar(select(func.count(DatevLink.id))) == 0


@pytest.mark.parametrize('change,expected', [('totals','invoice.totals'), ('approval','estimate.must_be_approved'), ('work','case.must_be_completed')])
def test_business_gates(client, monkeypatch, change, expected):
    iid, _ = invoice_fixture(client, monkeypatch)
    c, engine, _ = client
    with Session(engine) as db:
        if change == 'totals': db.get(Invoice, UUID(iid)).total = Decimal('999')
        if change == 'approval': db.scalar(select(Estimate)).status = EstimateStatus.DRAFT
        if change == 'work': db.scalar(select(RepairCase)).status = RepairCaseStatus.NEW
        db.commit()
    assert expected in c.get(f'/api/v1/datev/invoices/{iid}').json()['missing_fields']


def test_tenant_isolation_including_related_records(client, monkeypatch):
    iid, cid = invoice_fixture(client, monkeypatch)
    c, engine, _ = client
    with Session(engine) as db:
        db.get(Invoice, UUID(iid)).tenant_id = uuid4(); db.commit()
    path = f'/api/v1/datev/invoices/{iid}'
    assert c.get(path).status_code == 404
    for suffix in ('prepare','create'):
        assert c.post(path+'/'+suffix).status_code == 404
    with Session(engine) as db:
        db.get(Invoice, UUID(iid)).tenant_id = UUID(client[2])
        db.get(Customer, UUID(cid)).tenant_id = uuid4(); db.commit()
    assert c.get(path).status_code == 404
    assert c.post(f'/api/v1/datev/customers/{cid}/sync').status_code == 404


def test_sync_blocked_and_credentials_never_fall_back(client, monkeypatch):
    iid, cid = invoice_fixture(client, monkeypatch)
    c, engine, _ = client
    for _ in range(2):
        assert c.post(f'/api/v1/datev/customers/{cid}/sync').json()['detail']['code'] == 'contract_unverified'
    monkeypatch.setattr(get_settings(), 'datev_tenants', {str(uuid4()): DatevTenantConfig(client_id='foreign')})
    assert c.post('/api/v1/datev/connection').json()['detail']['code'] == 'configuration_incomplete'
    with Session(engine) as db:
        assert db.scalar(select(func.count(DatevLink.id))) == 1


def test_permissions(client, monkeypatch):
    iid, cid = invoice_fixture(client, monkeypatch)
    c, _, _ = client
    c.post('/api/v1/users', json={'email':'mechanic@example.com','password':'Mechanic2026!',
        'first_name':'M','last_name':'T','role_code':'MECHANIC'})
    token = c.post('/api/v1/auth/login',json={'email':'mechanic@example.com','password':'Mechanic2026!'}).json()['access_token']
    c.headers['Authorization'] = 'Bearer '+token
    for path in ('connection', f'customers/{cid}/sync', f'invoices/{iid}/prepare', f'invoices/{iid}/create'):
        assert c.post('/api/v1/datev/'+path).status_code == 403
    c.headers.pop('Authorization')
    assert c.post('/api/v1/datev/connection').status_code == 401


def test_oauth_contract_redaction_and_no_resource_claim(monkeypatch):
    import httpx
    cfg = DatevTenantConfig(base_url='https://example.invalid',client_id='id',client_secret='secret-value',
        authorization_key='key-value',scope='licensed-scope',client_credentials_confirmed=True)
    assert 'secret-value' not in repr(cfg)
    def post(self, url, **kwargs):
        assert url == 'https://login.datev.it/connect/token'
        assert kwargs['data']['grant_type'] == 'client_credentials'
        assert 'authorization_key' not in kwargs['data']
        return httpx.Response(200, json={'access_token':'never-expose'})
    monkeypatch.setattr(httpx.Client, 'post', post)
    result = DatevSBillClient(cfg).check_connection()
    assert result['sbill_connection'] == 'unverified'
    assert 'never-expose' not in json.dumps(result)
    for method in ('sync_customer','create_document'):
        with pytest.raises(DatevError, match='contract_unverified'):
            getattr(DatevSBillClient(cfg),method)({},'test-operation')
    def timeout(*args, **kwargs): raise httpx.ReadTimeout('secret-value')
    monkeypatch.setattr(httpx.Client, 'post', timeout)
    with pytest.raises(DatevError, match='oauth_unavailable'):
        DatevSBillClient(cfg).check_connection()


def test_concurrent_preparations_reserve_one_operation(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy import create_engine
    from app.db.base import Base
    from app.security.context import AuthContext
    from app.services.datev import save_preparation
    engine = create_engine(f'sqlite:///{tmp_path}/race.db', connect_args={'timeout': 15})
    Base.metadata.create_all(engine)
    auth = AuthContext(user_id=uuid4(), tenant_id=uuid4(), permissions=frozenset())
    local_id = uuid4()
    def reserve(_):
        with Session(engine) as db:
            link = save_preparation(db, auth, 'invoice', local_id, {'total':'122.00'})
            db.commit()
            return str(link.id)
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(reserve, range(2)))
    assert ids[0] == ids[1]
    with Session(engine) as db:
        assert db.scalar(select(func.count(DatevLink.id))) == 1
    engine.dispose()


def test_migration_upgrade_downgrade_preserves_invoice_lines(monkeypatch):
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    file = Path(__file__).parents[1] / 'migrations/versions/0008_datev_foundation.py'
    spec = importlib.util.spec_from_file_location('datev_migration', file)
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE invoice_lines (id INTEGER PRIMARY KEY)'))
        connection.execute(text('INSERT INTO invoice_lines (id) VALUES (1)'))
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        assert 'datev_links' in inspect(connection).get_table_names()
        assert 'source_category' in [col['name'] for col in inspect(connection).get_columns('invoice_lines')]
        migration.downgrade()
        assert 'datev_links' not in inspect(connection).get_table_names()
        assert connection.scalar(text('SELECT id FROM invoice_lines')) == 1
    engine.dispose()
