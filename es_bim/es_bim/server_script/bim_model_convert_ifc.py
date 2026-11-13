# Server Script: bim_model_convert_ifc
# Type: API
# Event: Before Insert
# API: /api/method/bim_model_convert_ifc

# ES BIM Module — IFC to XKT Conversion Server Script
# API endpoint: /api/method/bim_model_convert_ifc
# Called from BIM Model client script after IFC file upload.
# Runs ifc2xkt CLI as a subprocess (non-blocking background job via frappe.enqueue).
#
# Prerequisites on the bench server:
#   npm install -g @xeokit/xeokit-convert    (provides ifc2xkt CLI)
#   OR: pip install ifcopenshell             (for Python-based fallback)
#
# Frappe sandbox restrictions apply: no direct import, no augmented assignment.
# Use frappe.get_doc, frappe.get_all, string concatenation.

docname = frappe.form_dict.get('docname')

if not docname:
    frappe.throw('docname is required')

doc = frappe.get_doc('BIM Model', docname)

if not doc.ifc_file:
    frappe.throw('No IFC file attached to this BIM Model')

# Mark as processing
frappe.db.set_value('BIM Model', docname, 'status', 'Processing')
frappe.db.set_value('BIM Model', docname, 'conversion_log', 'Job queued at ' + str(frappe.utils.now()))
frappe.db.commit()

# Enqueue background conversion job
frappe.enqueue(
    'frappe.client.run_doc_method',
    queue='long',
    timeout=600,
    doctype='BIM Model',
    name=docname,
    method='_run_ifc_conversion'
)

frappe.response['message'] = 'Conversion job enqueued for ' + docname