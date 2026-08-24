"""Pure domain logic. Innermost layer: imports nothing from outer layers."""


def is_present(status: str) -> bool:
    """Return True when an attendance status counts as present."""
    return status == "present"
