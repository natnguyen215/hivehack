from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
PALISADES_HISTORY_FILE = DATA_DIR / "palisades_history.json"


def load_palisades_history() -> dict[str, Any]:
    with PALISADES_HISTORY_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)

