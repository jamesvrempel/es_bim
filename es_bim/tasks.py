"""ES BIM — Scheduled Tasks"""
import frappe


def sync_iot_sensors():
    """Hourly: refresh IoT sensor readings from Beacon Sensor Log."""
    links = frappe.get_all(
        "BIM IoT Sensor Link", filters={"active": 1},
        fields=["name", "vehicle_beacon", "alert_threshold_temp"],
    )
    for link in links:
        if not link.get("vehicle_beacon"):
            continue
        logs = frappe.get_all(
            "Beacon Sensor Log", filters={"beacon_name": link["vehicle_beacon"]},
            fields=["log_datetime", "temperature", "humidity", "battery", "device_status"],
            order_by="log_datetime desc", limit=1,
        )
        if not logs:
            continue
        r = logs[0]
        temp = float(r.get("temperature") or 0)
        threshold = link.get("alert_threshold_temp")
        in_alert = threshold and temp > float(threshold)
        frappe.db.set_value("BIM IoT Sensor Link", link["name"], {
            "last_temperature": temp,
            "last_humidity": float(r.get("humidity") or 0),
            "last_battery": float(r.get("battery") or 0),
            "last_reading_datetime": r.get("log_datetime"),
            "last_status": "Alert" if in_alert else (r.get("device_status") or "Online"),
        })
    if links:
        frappe.db.commit()
