"""Period resolution.

Every period is resolved against the latest transaction_date in the data, not
against today, and the resolved dates travel with the answer.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

DAY_END = time(23, 59, 59, 999999)


def parse_day(value: str) -> date:
    """Accept a plain date or the leading date of a timestamp."""
    return datetime.fromisoformat(str(value)[:19]).date() if len(str(value)) > 10 else date.fromisoformat(str(value))


def bounds(period: dict | None) -> tuple[datetime, datetime] | None:
    """The inclusive timestamp window a period covers, or None for all of time."""
    if not period or not period.get("start") or not period.get("end"):
        return None
    start = datetime.combine(parse_day(period["start"]), time.min)
    end = datetime.combine(parse_day(period["end"]), DAY_END)
    return start, end


def month_start(day: date) -> date:
    return day.replace(day=1)


def month_end(day: date) -> date:
    following = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return following - timedelta(days=1)


def label_for(start: date, end: date) -> str:
    if start == month_start(start) and end == month_end(start):
        return start.strftime("%B %Y")
    return f"{start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}"


def calendar_month(reference: date) -> dict:
    """The calendar month containing the reference day."""
    start, end = month_start(reference), month_end(reference)
    return {"kind": "calendar", "start": start.isoformat(), "end": end.isoformat(),
            "label": label_for(start, end)}


def calendar_quarter(reference: date) -> dict:
    """The calendar quarter containing the reference day, ending on the reference day."""
    start = date(reference.year, 3 * ((reference.month - 1) // 3) + 1, 1)
    return {"kind": "calendar", "start": start.isoformat(), "end": reference.isoformat(),
            "label": f"Q{(reference.month - 1) // 3 + 1} {reference.year}"}


def trailing(reference: date, days: int) -> dict:
    """The window of the given length ending on the reference day."""
    start = reference - timedelta(days=days - 1)
    return {"kind": "trailing", "start": start.isoformat(), "end": reference.isoformat(),
            "label": f"trailing {days} days to {reference.strftime('%d %b %Y')}"}


def previous(period: dict) -> dict:
    """The period immediately before this one, of the same shape and length."""
    start, end = parse_day(period["start"]), parse_day(period["end"])
    if period.get("kind") == "calendar" and start == month_start(start) and end == month_end(start):
        earlier = start - timedelta(days=1)
        return calendar_month(earlier)
    length = (end - start).days + 1
    new_end = start - timedelta(days=1)
    new_start = new_end - timedelta(days=length - 1)
    return {"kind": period.get("kind", "trailing"), "start": new_start.isoformat(),
            "end": new_end.isoformat(), "label": label_for(new_start, new_end)}


def as_trailing(period: dict) -> dict:
    """The same length window read as trailing days ending on the period's end."""
    start, end = parse_day(period["start"]), parse_day(period["end"])
    return trailing(end, (end - start).days + 1)


def as_calendar(period: dict) -> dict:
    """The calendar month containing the period's end."""
    return calendar_month(parse_day(period["end"]))
