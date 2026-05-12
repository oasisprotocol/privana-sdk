from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "_config.json"

CONFIG: dict[str, Any] = json.loads(_CONFIG_PATH.read_text())
