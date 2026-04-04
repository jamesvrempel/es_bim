# Server Script: bim_run_conversion_job
# Type: API
# Event: Before Insert
# API: /api/method/bim_run_conversion_job

# ES BIM Module — Background IFC → XKT conversion worker
# API: /api/method/bim_run_conversion_job

def run_conversion(docname):
    doc = frappe.get_doc('BIM Model', docname)

    if not doc.ifc_file:
        frappe.db.set_value('BIM Model', docname, 'status', 'Error')
        frappe.db.set_value('BIM Model', docname, 'conversion_log', 'ERROR: No IFC file found')
        frappe.db.commit()
        return

    site_path = frappe.get_site_path()
    ifc_url = doc.ifc_file
    log_lines = []
    log_lines.append('Started: ' + str(frappe.utils.now()))

    if '/private/files/' in ifc_url:
        rel = ifc_url.split('/private/files/')[-1]
        ifc_abs = site_path + '/private/files/' + rel
        xkt_rel = rel.replace('.ifc', '.xkt').replace('.IFC', '.xkt')
        xkt_abs = site_path + '/private/files/' + xkt_rel
        xkt_url = '/private/files/' + xkt_rel
        is_private = 1
    else:
        rel = ifc_url.split('/files/')[-1]
        ifc_abs = site_path + '/public/files/' + rel
        xkt_rel = rel.replace('.ifc', '.xkt').replace('.IFC', '.xkt')
        xkt_abs = site_path + '/public/files/' + xkt_rel
        xkt_url = '/files/' + xkt_rel
        is_private = 0

    log_lines.append('IFC: ' + ifc_abs)
    log_lines.append('XKT: ' + xkt_abs)

    cmd_parts = ['ifc2xkt', '-s', ifc_abs, '-o', xkt_abs]
    log_lines.append('CMD: ' + ' '.join(cmd_parts))

    try:
        import subprocess as sp
        result = sp.run(cmd_parts, capture_output=True, text=True, timeout=300)
        stdout_val = result.stdout or ''
        stderr_val = result.stderr or ''
        returncode = result.returncode
        log_lines.append('RC: ' + str(returncode))
        if stdout_val:
            log_lines.append('OUT: ' + stdout_val[:500])
        if stderr_val:
            log_lines.append('ERR: ' + stderr_val[:500])
    except Exception as ex:
        log_lines.append('EXCEPTION: ' + str(ex))
        returncode = -1
        xkt_exists_flag = False
        log_msg = '\n'.join(log_lines)
        frappe.db.set_value('BIM Model', docname, 'status', 'Error')
        frappe.db.set_value('BIM Model', docname, 'conversion_log', log_msg)
        frappe.db.commit()
        return

    import os as _os
    xkt_exists_flag = _os.path.isfile(xkt_abs) and _os.path.getsize(xkt_abs) > 0

    if xkt_exists_flag:
        log_lines.append('SUCCESS: XKT file produced')
        xkt_fname = xkt_rel.split('/')[-1]
        existing_file = frappe.db.get_value('File', {'file_url': xkt_url}, 'name')
        if not existing_file:
            file_doc = frappe.get_doc({
                'doctype': 'File',
                'file_name': xkt_fname,
                'file_url': xkt_url,
                'attached_to_doctype': 'BIM Model',
                'attached_to_name': docname,
                'attached_to_field': 'xkt_file',
                'is_private': is_private
            })
            file_doc.insert(ignore_permissions=True)
        log_msg = '\n'.join(log_lines)
        frappe.db.set_value('BIM Model', docname, 'xkt_file', xkt_url)
        frappe.db.set_value('BIM Model', docname, 'status', 'Ready')
        frappe.db.set_value('BIM Model', docname, 'conversion_log', log_msg)
        frappe.db.commit()
    else:
        log_lines.append('ERROR: XKT not produced')
        log_msg = '\n'.join(log_lines)
        frappe.db.set_value('BIM Model', docname, 'status', 'Error')
        frappe.db.set_value('BIM Model', docname, 'conversion_log', log_msg)
        frappe.db.commit()


docname = frappe.form_dict.get('docname')
if docname:
    run_conversion(docname)
    frappe.response['message'] = 'Done: ' + str(frappe.db.get_value('BIM Model', docname, 'status'))
else:
    frappe.response['message'] = 'No docname provided'
