"""ES BIM — Install / Migrate hooks"""
import json
import frappe
from frappe import _


def after_install():
    create_module_def()
    create_roles()
    setup_workspace_content()
    frappe.db.commit()
    frappe.msgprint(_("ES BIM installed. Navigate to /app/es-bim to get started."))


def after_migrate():
    setup_workspace_content()
    frappe.db.commit()


def create_module_def():
    if not frappe.db.exists("Module Def", "ES BIM"):
        frappe.get_doc({
            "doctype": "Module Def", "module_name": "ES BIM", "app_name": "es_bim",
        }).insert(ignore_permissions=True)


def create_roles():
    for role_name in ["BIM Manager", "BIM User"]:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc({
                "doctype": "Role", "role_name": role_name, "desk_access": 1,
            }).insert(ignore_permissions=True)


def setup_workspace_content():
    """
    Write workspace canvas via direct SQL to bypass the on_update export_to_files
    hook, which fails for database-only modules (module field set to 'frappe').
    """
    if not frappe.db.exists("Workspace", "ES BIM"):
        return
    content = [
        {"id":"bim_hdr",  "type":"header",   "data":{"text":"<span class='h4'>ES Building Information Management</span>","col":12}},
        {"id":"bim_sp1",  "type":"spacer",   "data":{"col":12}},
        {"id":"bim_sc1",  "type":"shortcut", "data":{"shortcut_name":"BIM Projects","col":3}},
        {"id":"bim_sc2",  "type":"shortcut", "data":{"shortcut_name":"BIM Models","col":3}},
        {"id":"bim_sc3",  "type":"shortcut", "data":{"shortcut_name":"Cost Items","col":3}},
        {"id":"bim_sc4",  "type":"shortcut", "data":{"shortcut_name":"5D Budget vs Actual","col":3}},
        {"id":"bim_sc5",  "type":"shortcut", "data":{"shortcut_name":"Issues","col":3}},
        {"id":"bim_sc6",  "type":"shortcut", "data":{"shortcut_name":"IoT Links","col":3}},
        {"id":"bim_sc7",  "type":"shortcut", "data":{"shortcut_name":"Floor Plans","col":3}},
        {"id":"bim_sp2",  "type":"spacer",   "data":{"col":12}},
        {"id":"bim_card", "type":"card",     "data":{"card_name":"BIM Core","col":12}},
    ]
    frappe.db.sql(
        "UPDATE `tabWorkspace` SET content = %s WHERE name = 'ES BIM'",
        (json.dumps(content),)
    )
