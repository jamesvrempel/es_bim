# Server Script: BIM Issue - Auto Resolve Date
# Type: DocType Event
# Event: Before Save

# ES BIM Phase 4 — Auto-set resolved_date when status changes to Resolved or Closed
# Also auto-clear resolved_date if status is reopened

if doc.status in ('Resolved', 'Closed'):
    if not doc.resolved_date:
        doc.resolved_date = frappe.utils.today()
elif doc.status in ('Open', 'In Review'):
    doc.resolved_date = None