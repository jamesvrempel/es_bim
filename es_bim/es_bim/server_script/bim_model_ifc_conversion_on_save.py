# Server Script: BIM Model - IFC Conversion on Save
# Type: DocType Event
# Event: After Save

# ES BIM Module — IFC → XKT Conversion trigger (After Save)
# Fires when a BIM Model is saved. If IFC file is present and status
# is Processing, enqueues the background conversion job.
#
# Sandbox restrictions: no import, no augmented assignment, no .format()

if doc.ifc_file and doc.status == 'Processing':
    log_msg = 'IFC conversion job queued at ' + str(frappe.utils.now())
    frappe.db.set_value('BIM Model', doc.name, 'conversion_log', log_msg)
    frappe.db.commit()
    # Enqueue the long-running conversion — calls the bim_run_conversion_job API script
    frappe.enqueue(
        'frappe.handler.execute_cmd',
        queue='long',
        timeout=600,
        cmd='bim_run_conversion_job',
        docname=doc.name
    )