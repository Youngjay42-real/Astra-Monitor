from datetime import date, timedelta


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_checkin_and_status(client):
    payload = {
        "heart_rate": 72,
        "bp_sys": 118,
        "bp_dia": 76,
        "spo2": 98,
        "sleep_hours": 5.5,
        "mood": 3,
        "exercise_minutes": 15,
        "symptoms": "mild headache",
    }
    created = client.post("/api/checkins", json=payload)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["heart_rate"] == 72
    assert "id" in body

    listed = client.get("/api/checkins")
    assert listed.status_code == 200
    assert len(listed.json()) >= 1

    status = client.get("/api/status")
    assert status.status_code == 200, status.text
    data = status.json()
    assert data["overall"] in ("nominal", "caution", "critical")
    assert set(data["domains"]) == {"radiation", "bone", "cardio", "immune", "behavioral"}
    assert isinstance(data["actions"], list)
    assert len(data["actions"]) >= 1


def test_radiation_events(client):
    r = client.get("/api/radiation/events")
    assert r.status_code == 200
    events = r.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    assert "sepID" in events[0]
    assert "eventTime" in events[0]


def test_evidence(client):
    r = client.get("/api/evidence")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["roadmap"]["id"] == "Medical-701"


def test_assess_and_protocol(client):
    r = client.post(
        "/api/assess",
        json={"symptoms": ["headache", "fatigue"], "severity": "moderate", "notes": ""},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["protocol_id"]
    assert data["guidance"]
    assert "not a clinical diagnosis" in data["disclaimer"].lower()

    proto = client.get(f"/api/protocols/{data['protocol_id']}")
    assert proto.status_code == 200
    assert len(proto.json()["steps"]) >= 1

    missing = client.get("/api/protocols/does-not-exist")
    assert missing.status_code == 404


def test_inventory_seed_and_upsert(client):
    listed = client.get("/api/inventory")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) >= 1
    skus = {i["sku"] for i in items}
    assert "ANALGESIC" in skus

    upsert = client.post(
        "/api/inventory",
        json={
            "sku": "ANALGESIC",
            "name": "Analgesic (kit pack)",
            "quantity": 2,
            "unit": "dose",
            "expires_on": (date.today() + timedelta(days=30)).isoformat(),
            "notes": "test",
        },
    )
    assert upsert.status_code == 200, upsert.text
    assert upsert.json()["quantity"] == 2
    assert upsert.json()["low_stock"] is True


def test_predictions(client):
    client.post(
        "/api/checkins",
        json={
            "heart_rate": 108,
            "bp_sys": 118,
            "bp_dia": 76,
            "spo2": 93,
            "sleep_hours": 4.5,
            "mood": 2,
            "exercise_minutes": 5,
            "symptoms": "fatigue",
        },
    )
    r = client.get("/api/predictions")
    assert r.status_code == 200
    flags = r.json()["flags"]
    assert isinstance(flags, list)
    assert len(flags) >= 1


def test_checkin_validation(client):
    bad = client.post(
        "/api/checkins",
        json={
            "heart_rate": 10,
            "bp_sys": 118,
            "bp_dia": 76,
            "spo2": 98,
            "sleep_hours": 5,
            "mood": 3,
            "exercise_minutes": 10,
            "symptoms": "",
        },
    )
    assert bad.status_code == 422
