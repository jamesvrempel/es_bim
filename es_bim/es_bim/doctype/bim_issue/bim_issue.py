"""BIM Issue — set resolved_date when status changes to Resolved/Closed."""
import frappe
from frappe.utils import today

def before_save(doc, method=None):
    if doc.status in ("Resolved", "Closed"):
        if not doc.resolved_date:
            doc.resolved_date = today()
    else:
        doc.resolved_date = None
