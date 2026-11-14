from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import InventoryItem


DEFAULT_INVENTORY = [
    {
        "sku": "ANALGESIC",
        "name": "Analgesic (kit pack)",
        "quantity": 12,
        "unit": "dose",
        "expires_on": date.today() + timedelta(days=400),
        "notes": "Supportive care only; follow kit protocol",
    },
    {
        "sku": "ELECTROLYTE",
        "name": "Electrolyte packets",
        "quantity": 20,
        "unit": "packet",
        "expires_on": date.today() + timedelta(days=500),
        "notes": "",
    },
    {
        "sku": "BANDAGE",
        "name": "Sterile bandage kit",
        "quantity": 8,
        "unit": "kit",
        "expires_on": date.today() + timedelta(days=800),
        "notes": "",
    },
    {
        "sku": "THERMOMETER",
        "name": "Digital thermometer",
        "quantity": 2,
        "unit": "unit",
        "expires_on": None,
        "notes": "Reusable",
    },
]


def seed_inventory(db: Session) -> None:
    for item in DEFAULT_INVENTORY:
        existing = db.query(InventoryItem).filter(InventoryItem.sku == item["sku"]).one_or_none()
        if existing:
            continue
        db.add(InventoryItem(**item))
    db.commit()
