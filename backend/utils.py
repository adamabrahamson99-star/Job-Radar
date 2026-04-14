"""
Radar — shared backend utilities.
Small, pure helper functions used across multiple backend modules.
"""

import json
from typing import Any


def parse_json_field(obj: dict, field: str, default: Any = None) -> dict:
    """
    Safely parse a JSON-string field in a dict in-place.

    If the value at obj[field] is already a non-string (list, dict, etc.)
    it is left untouched. If it is a string, it is parsed; on failure the
    default is used instead.

    Returns the same dict (mutated) for easy chaining.
    """
    if default is None:
        default = []
    value = obj.get(field)
    if isinstance(value, str):
        try:
            obj[field] = json.loads(value)
        except (json.JSONDecodeError, ValueError):
            obj[field] = default
    return obj
