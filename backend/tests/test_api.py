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
    assert isinstance(body["id"], str)
    assert body["created_at"].endswith("Z")

    listed = client.get("/api/checkins")
    assert listed.status_code == 200
    assert len(listed.json()) >= 1
    assert isinstance(listed.json()[0]["id"], str)

    status = client.get("/api/status")
    assert status.status_code == 200, status.text
    data = status.json()
    assert data["overall"] in ("nominal", "caution", "critical")
    assert set(data["domains"]) == {"radiation", "bone", "cardio", "immune", "behavioral"}
    assert data["domains"]["bone"]["action"]
    assert isinstance(data["actions"], list)
    assert len(data["actions"]) >= 1


def test_radiation_events(client):
    r = client.get("/api/radiation/events")
    assert r.status_code == 200
    events = r.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    assert "sepID" in events[0]
    assert events[0]["eventTime"].endswith("Z")
    assert "T" in events[0]["eventTime"]


def test_evidence(client):
    r = client.get("/api/evidence")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert {"id", "source", "title", "description", "url"} <= set(data[0].keys())
    assert any(item["source"] == "HRR" for item in data)


def test_assess_and_protocol(client):
    r = client.post(
        "/api/assess",
        json={"symptoms": ["headache", "fatigue"], "severity": "moderate", "notes": ""},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["guidance"]
    assert data["guidance"][0]["detail"]
    assert data["guidance"][0]["protocol_id"]
    protocol_id = data["guidance"][0]["protocol_id"]

    proto = client.get(f"/api/protocols/{protocol_id}")
    assert proto.status_code == 200
    body = proto.json()
    assert body["summary"]
    assert body["steps"][0]["id"]
    assert body["steps"][0]["text"]
    assert "required_items" in body

    # Frontend default protocol alias
    alias = client.get("/api/protocols/crew-check-in")
    assert alias.status_code == 200
    assert alias.json()["steps"]

    missing = client.get("/api/protocols/does-not-exist")
    assert missing.status_code == 404


def test_inventory_seed_and_upsert(client):
    listed = client.get("/api/inventory")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) >= 1
    assert items[0]["id"]
    assert "low_threshold" in items[0]
    ids = {i["id"] for i in items}
    assert "ANALGESIC" in ids

    upsert = client.post(
        "/api/inventory",
        json={
            "id": "ANALGESIC",
            "name": "Analgesic (kit pack)",
            "quantity": 2,
            "unit": "dose",
            "low_threshold": 3,
            "expires_on": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert upsert.status_code == 200, upsert.text
    assert upsert.json()["quantity"] == 2
    assert upsert.json()["id"] == "ANALGESIC"


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
    flags = r.json()
    assert isinstance(flags, list)
    assert len(flags) >= 1
    assert flags[0]["id"]
    assert flags[0]["domain"]
    assert flags[0]["label"]


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


def test_approach(client):
    r = client.get("/api/approach")
    assert r.status_code == 200
    data = r.json()
    assert data["nasa_advantages"]
    assert data["nasa_bottlenecks"]
    assert data["astra_improvements"]
    assert any(
        "Medical-701" in b["title"] or "Medical-701" in b["detail"]
        for b in data["nasa_bottlenecks"]
    )


def test_simulation_run_compare(client):
    start = client.post("/api/simulation/start", json={"days": 5, "scenario": "sep_storm"})
    assert start.status_code == 200, start.text
    sim_id = start.json()["id"]
    assert start.json()["finished"] is False

    ran = client.post(f"/api/simulation/{sim_id}/run")
    assert ran.status_code == 200, ran.text
    data = ran.json()
    assert data["finished"] is True
    assert data["day"] == 5
    assert data["compare"] is not None
    assert data["compare"]["baseline_peak_risk"] >= data["compare"]["astra_peak_risk"]
    branches = {d["branch"] for d in data["days"]}
    assert branches == {"astra", "baseline"}
    assert any(d["sep_active"] for d in data["days"])
