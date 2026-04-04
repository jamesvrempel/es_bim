from . import __version__ as app_version

app_name = "es_bim"
app_title = "ES Building Information Management"
app_publisher = "Enterprise Systems Australia"
app_description = "3D, 4D & 5D BIM Module for ERPNext — xeokit viewer, IFC/XKT conversion, 4D scheduling, 5D cost, BCF issues, IoT monitoring"
app_email = "info@enterprisesystems.com.au"
app_license = "MIT"
app_icon = "building"
app_color = "blue"

# ── Fixtures ───────────────────────────────────────────────────────────────────
fixtures = [
    {"doctype": "Role", "filters": [["name", "in", ["BIM Manager", "BIM User"]]]},
    {"doctype": "Module Def", "filters": [["name", "=", "ES BIM"]]},
    {"doctype": "Workspace", "filters": [["name", "=", "ES BIM"]]},
    {"doctype": "Client Script", "filters": [["name", "like", "BIM%"]]},
    {
        "doctype": "Server Script",
        "filters": [["name", "in", [
            "bim_model_convert_ifc", "bim_run_conversion_job",
            "BIM Model - IFC Conversion on Save", "BIM Cost Item - Calculate on Save",
            "bim_ifc_quantity_takeoff", "bim_federation_models",
            "bim_iot_sync", "BIM Issue - Auto Resolve Date",
        ]]]
    },
    {"doctype": "Dashboard Chart", "filters": [["name", "like", "BIM 5D%"]]},
    {"doctype": "Dashboard", "filters": [["name", "=", "BIM 5D Budget vs Actual"]]},
]

# ── Install / Migrate hooks ────────────────────────────────────────────────────
after_install = "es_bim.install.after_install"
after_migrate = "es_bim.install.after_migrate"

# ── Scheduled tasks ────────────────────────────────────────────────────────────
scheduler_events = {
    "hourly": ["es_bim.tasks.sync_iot_sensors"]
}
