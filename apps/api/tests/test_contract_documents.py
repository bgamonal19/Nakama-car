from test_users import client  # noqa: F401  (pytest fixture)


def test_contract_documents_upload_download_delete(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"customer_type": "COMPANY", "company_name": "Univex Srl"}).json()
    contract = c.post("/api/v1/contracts", json={
        "customer_id": customer["id"], "name": "Manutenzione flotta Univex", "start_date": "2026-01-01",
    }).json()
    base = f"/api/v1/contracts/{contract['id']}/documents"
    assert c.get(base).json() == []

    assert c.post(base, params={"filename": "vuoto.pdf"}, content=b"", headers={"Content-Type": "application/pdf"}).status_code == 422
    pdf = b"%PDF-1.4 contratto firmato"
    saved = c.post(base, params={"filename": "Contratto firmato è.pdf"}, content=pdf, headers={"Content-Type": "application/pdf"})
    assert saved.status_code == 201, saved.text
    document = saved.json()
    assert document["filename"] == "Contratto firmato è.pdf" and document["size_bytes"] == len(pdf)
    assert [d["id"] for d in c.get(base).json()] == [document["id"]]

    download = c.get(f"{base}/{document['id']}")
    assert download.status_code == 200 and download.content == pdf
    assert download.headers["content-type"] == "application/pdf"
    assert "attachment" in download.headers["content-disposition"]

    # The contract's documents go with the customer when an administrator removes it.
    assert c.delete(f"{base}/{document['id']}").status_code == 204
    assert c.get(f"{base}/{document['id']}").status_code == 404
    assert c.get(base).json() == []

    c.post(base, params={"filename": "allegato.pdf"}, content=pdf, headers={"Content-Type": "application/pdf"})
    assert c.delete(f"/api/v1/customers/{customer['id']}", params={"force": "true"}).status_code == 204
