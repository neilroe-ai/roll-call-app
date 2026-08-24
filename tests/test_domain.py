from roll_call.domain.attendance import is_present


def test_is_present() -> None:
    assert is_present("present")
    assert not is_present("absent")
