# Server Script: bim_federation_models
# Type: API
# Event: Before Insert
# API: /api/method/bim_federation_models

# ES BIM Phase 4 — Multi-model federation API
# Endpoint: /api/method/bim_federation_models
# Args: bim_project, federation_group (optional)
#
# Returns all Ready BIM Models for a project so the xeokit viewer
# can load them all into a single federated scene.
# Optionally filtered by federation_group tag.

bim_project = frappe.form_dict.get('bim_project')
fed_group = frappe.form_dict.get('federation_group', '')

if not bim_project:
    frappe.response['message'] = {'error': 'bim_project is required'}
else:
    filters = {'bim_project': bim_project, 'status': 'Ready'}
    if fed_group:
        filters['federation_group'] = fed_group

    models = frappe.get_all('BIM Model',
        filters=filters,
        fields=['name','model_name','discipline','xkt_file',
                'ifc_schema','federation_group','is_default','version'],
        order_by='discipline asc')

    # Assign a distinct colour per discipline for federation overlay
    disc_colors = {
        'Architectural': [0.85, 0.85, 0.85],
        'Structural':    [0.70, 0.55, 0.35],
        'Mechanical':    [0.20, 0.60, 0.86],
        'Electrical':    [0.98, 0.76, 0.15],
        'Plumbing':      [0.25, 0.70, 0.45],
        'Civil':         [0.60, 0.50, 0.40],
        'Landscape':     [0.40, 0.70, 0.30],
        'Facade':        [0.55, 0.80, 0.90],
    }

    model_list = []
    for m in models:
        col = disc_colors.get(m.get('discipline',''), [0.75, 0.75, 0.75])
        model_list.append({
            'name':             m['name'],
            'model_name':       m['model_name'],
            'discipline':       m.get('discipline',''),
            'xkt_file':         m.get('xkt_file',''),
            'federation_group': m.get('federation_group',''),
            'is_default':       m.get('is_default', 0),
            'color_rgb':        col
        })

    frappe.response['message'] = {
        'bim_project': bim_project,
        'model_count': len(model_list),
        'models': model_list
    }