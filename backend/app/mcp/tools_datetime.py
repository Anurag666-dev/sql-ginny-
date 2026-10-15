from datetime import datetime, timezone
import time

def tool_get_current_datetime() -> dict:
    """
    Returns the current local date, time, ISO 8601 timestamp, UTC timestamp, and timezone.
    """
    now_utc = datetime.now(timezone.utc)
    now_local = datetime.now()
    tz_name = time.tzname[time.daylight] if time.daylight else time.tzname[0]
    
    return {
        "iso_timestamp_utc": now_utc.isoformat(),
        "local_datetime": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        "date": now_local.strftime("%Y-%m-%d"),
        "time": now_local.strftime("%H:%M:%S"),
        "timezone": tz_name,
        "unix_epoch": int(time.time())
    }
