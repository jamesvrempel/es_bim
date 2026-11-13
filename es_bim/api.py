"""ES BIM — Whitelisted API endpoints"""
import frappe
from frappe import _


@frappe.whitelist()
def get_federation_models(bim_project):
    """Return all Ready BIM Models for a project with discipline colours."""
    COLOURS = {
        "Architectural": [0.7, 0.7, 0.7], "Structural": [0.6, 0.4, 0.2],
        "Mechanical": [0.2, 0.6, 0.9], "Electrical": [0.9, 0.8, 0.1],
        "Plumbing": [0.2, 0.8, 0.4], "Civil": [0.5, 0.5, 0.5],
    }
    models = frappe.get_all(
        "BIM Model", filters={"bim_project": bim_project, "status": "Ready"},
        fields=["name", "model_name", "discipline", "xkt_file", "is_default", "federation_group"],
    )
    for m in models:
        m["colour"] = COLOURS.get(m.get("discipline"), [0.5, 0.5, 0.5])
    return models


@frappe.whitelist()
def sync_iot_sensors(bim_project=None):
    """Refresh IoT sensor readings. Returns updated sensor list."""
    filters = {"active": 1}
    if bim_project:
        filters["bim_project"] = bim_project
    links = frappe.get_all(
        "BIM IoT Sensor Link", filters=filters,
        fields=["name", "link_name", "sensor_type", "vehicle_beacon", "ifc_guid",
                "element_description", "floor_level", "alert_threshold_temp",
                "last_temperature", "last_humidity", "last_battery",
                "last_reading_datetime", "last_status"],
    )
    for link in links:
        beacon = link.get("vehicle_beacon")
        if not beacon:
            continue
        logs = frappe.get_all(
            "Beacon Sensor Log", filters={"beacon_name": beacon},
            fields=["log_datetime", "temperature", "humidity", "battery", "device_status"],
            order_by="log_datetime desc", limit=1,
        )
        if logs:
            r = logs[0]
            temp = float(r.get("temperature") or 0)
            threshold = link.get("alert_threshold_temp")
            in_alert = threshold and temp > float(threshold)
            link.update({
                "last_temperature": temp,
                "last_humidity": float(r.get("humidity") or 0),
                "last_battery": float(r.get("battery") or 0),
                "last_reading_datetime": str(r.get("log_datetime") or ""),
                "last_status": "Alert" if in_alert else (r.get("device_status") or "Online"),
                "in_alert": bool(in_alert),
            })
    return links


@frappe.whitelist()
def get_ifc_quantity_takeoff(bim_model):
    """Extract QTO from IFC. Falls back to mock if ifcopenshell not installed."""
    doc = frappe.get_doc("BIM Model", bim_model)
    if not doc.ifc_file:
        frappe.throw(_("No IFC file attached to this model."))
    try:
        import ifcopenshell
        import ifcopenshell.util.element as ifc_util
        ifc_path = frappe.get_site_path("public") + doc.ifc_file
        ifc_file = ifcopenshell.open(ifc_path)
        quantities = []
        for product in ifc_file.by_type("IfcProduct"):
            psets = ifc_util.get_psets(product)
            bq = psets.get("BaseQuantities", {})
            if bq:
                quantities.append({
                    "ifc_guid": product.GlobalId,
                    "element_name": getattr(product, "Name", "") or "",
                    "ifc_type": product.is_a(),
                    "gross_volume": bq.get("GrossVolume", 0),
                    "net_volume": bq.get("NetVolume", 0),
                    "gross_area": bq.get("GrossFloorArea", bq.get("GrossArea", 0)),
                    "length": bq.get("Length", 0),
                })
        return quantities
    except ImportError:
        return [
            {"ifc_guid": "1ABC001", "element_name": "Slab B1",    "ifc_type": "IfcSlab",        "gross_volume": 180.0, "net_volume": 174.0, "gross_area": 720.0, "length": 0},
            {"ifc_guid": "1ABC002", "element_name": "Column A/1", "ifc_type": "IfcColumn",      "gross_volume": 2.69,  "net_volume": 2.69,  "gross_area": 0,     "length": 4200},
            {"ifc_guid": "1ABC003", "element_name": "Beam L1-01", "ifc_type": "IfcBeam",        "gross_volume": 1.44,  "net_volume": 1.44,  "gross_area": 0,     "length": 8000},
            {"ifc_guid": "1ABC004", "element_name": "Wall W01",   "ifc_type": "IfcWall",        "gross_volume": 12.0,  "net_volume": 11.5,  "gross_area": 48.0,  "length": 0},
            {"ifc_guid": "1ABC005", "element_name": "CW-North",   "ifc_type": "IfcCurtainWall", "gross_volume": 0,     "net_volume": 0,     "gross_area": 151.2, "length": 0},
        ]
