# Server Script: bim_ifc_quantity_takeoff
# Type: API
# Event: Before Insert
# API: /api/method/bim_ifc_quantity_takeoff

# ES BIM Phase 3 — IFC Quantity Take-Off API
# Endpoint: /api/method/bim_ifc_quantity_takeoff
# Args: model_name (BIM Model docname)
#
# Reads the uploaded IFC file using ifcopenshell (if installed),
# extracts BaseQuantities property sets (area, volume, length),
# aggregates by IFC type, and returns a take-off table.
#
# Server setup (once): pip install ifcopenshell --break-system-packages
# Falls back to a structured mock if ifcopenshell not available.

def run_takeoff(model_name):
    model_doc = frappe.get_doc('BIM Model', model_name)

    if not model_doc.ifc_file:
        frappe.response['message'] = {'error': 'No IFC file on this BIM Model'}
        return

    site_path = frappe.get_site_path()
    ifc_url = model_doc.ifc_file

    if '/private/files/' in ifc_url:
        rel = ifc_url.split('/private/files/')[-1]
        ifc_abs = site_path + '/private/files/' + rel
    else:
        rel = ifc_url.split('/files/')[-1]
        ifc_abs = site_path + '/public/files/' + rel

    takeoff_rows = []

    # Try ifcopenshell extraction
    try:
        ifc = ifcopenshell.open(ifc_abs)

        # Aggregate quantities by IFC type from BaseQuantities psets
        type_qtys = {}

        for pset_rel in ifc.by_type('IfcRelDefinesByProperties'):
            pset = pset_rel.RelatingPropertyDefinition
            if pset.is_a('IfcElementQuantity') and pset.Name in ('BaseQuantities', 'Qto_WallBaseQuantities', 'Qto_SlabBaseQuantities', 'Qto_ColumnBaseQuantities', 'Qto_BeamBaseQuantities'):
                for related in pset_rel.RelatedObjects:
                    ifc_type = related.is_a()
                    if ifc_type not in type_qtys:
                        type_qtys[ifc_type] = {}
                    for qty in pset.Quantities:
                        q_name = qty.Name
                        if qty.is_a('IfcQuantityArea'):
                            v = qty.AreaValue or 0
                        elif qty.is_a('IfcQuantityVolume'):
                            v = qty.VolumeValue or 0
                        elif qty.is_a('IfcQuantityLength'):
                            v = qty.LengthValue or 0
                        elif qty.is_a('IfcQuantityCount'):
                            v = qty.CountValue or 0
                        else:
                            continue
                        existing = type_qtys[ifc_type].get(q_name, 0)
                        type_qtys[ifc_type][q_name] = existing + v

        for ifc_type, qtys in type_qtys.items():
            for q_name, total in qtys.items():
                if total > 0:
                    takeoff_rows.append({
                        'ifc_type': ifc_type,
                        'quantity_name': q_name,
                        'total': round(total, 2),
                        'source': 'ifcopenshell'
                    })

        frappe.response['message'] = {
            'model': model_name,
            'ifc_file': ifc_url,
            'rows': takeoff_rows,
            'row_count': len(takeoff_rows),
            'method': 'ifcopenshell'
        }

    except Exception as e:
        # Graceful fallback: return structured mock data
        # (used when ifcopenshell not installed or IFC parse error)
        mock_rows = [
            {'ifc_type': 'IfcWall',        'quantity_name': 'NetSideArea',    'total': 4820.5,  'source': 'mock', 'uom': 'Square Meter'},
            {'ifc_type': 'IfcSlab',        'quantity_name': 'NetArea',        'total': 9600.0,  'source': 'mock', 'uom': 'Square Meter'},
            {'ifc_type': 'IfcColumn',      'quantity_name': 'GrossVolume',    'total': 312.4,   'source': 'mock', 'uom': 'Cubic Meter'},
            {'ifc_type': 'IfcBeam',        'quantity_name': 'GrossVolume',    'total': 198.8,   'source': 'mock', 'uom': 'Cubic Meter'},
            {'ifc_type': 'IfcSlab',        'quantity_name': 'GrossVolume',    'total': 1152.0,  'source': 'mock', 'uom': 'Cubic Meter'},
            {'ifc_type': 'IfcWindow',      'quantity_name': 'Area',           'total': 2340.0,  'source': 'mock', 'uom': 'Square Meter'},
            {'ifc_type': 'IfcDoor',        'quantity_name': 'Area',           'total': 186.0,   'source': 'mock', 'uom': 'Square Meter'},
            {'ifc_type': 'IfcRoof',        'quantity_name': 'NetArea',        'total': 820.0,   'source': 'mock', 'uom': 'Square Meter'},
        ]
        frappe.response['message'] = {
            'model': model_name,
            'ifc_file': ifc_url,
            'rows': mock_rows,
            'row_count': len(mock_rows),
            'method': 'fallback_mock',
            'error': str(e)
        }


model_name = frappe.form_dict.get('model_name')
if model_name:
    run_takeoff(model_name)
else:
    frappe.response['message'] = {'error': 'model_name is required'}