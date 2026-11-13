// Client Script: BIM Project - Model Summary
// DocType: BIM Project
// ES5 compatible — no const/let/=>/template literals

// ES BIM Module — BIM Project client script
// Shows a live summary of linked BIM Models in the Model Summary HTML field.

frappe.ui.form.on('BIM Project', {

    refresh: function(frm) {
        if (frm.doc.name && !frm.doc.__islocal) {
            renderModelSummary(frm);
        }
        frm.add_custom_button(__('New BIM Model'), function() {
            frappe.new_doc('BIM Model', { bim_project: frm.doc.name });
        }, __('BIM Actions'));
        frm.add_custom_button(__('All Models for this Project'), function() {
            frappe.route_options = { bim_project: frm.doc.name };
            frappe.set_route('List', 'BIM Model');
        }, __('BIM Actions'));
    }

});

function renderModelSummary(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Model',
            filters: { bim_project: frm.doc.name },
            fields: ['name', 'model_name', 'discipline', 'status', 'version', 'ifc_file', 'xkt_file'],
            limit: 20
        },
        callback: function(r) {
            var models = r.message || [];
            var container = document.getElementById('bim-project-model-summary');
            if (!container) return;

            if (!models.length) {
                container.innerHTML = '<div style="color:#8d99a6;font-style:italic;padding:10px;">No BIM Models linked yet. Use BIM Actions to add one.</div>';
                return;
            }

            var statusColor = { 'Ready':'#4CAF50','Processing':'#2196F3','Error':'#f44336','Draft':'#9e9e9e','Archived':'#795548' };
            var disciplineIcon = { 'Architectural':'🏗','Structural':'🔩','Mechanical':'⚙️','Electrical':'⚡','Plumbing':'🔏','Civil':'🚧','Landscape':'🌱','Federated':'🔗' };

            var html = '<div style="display:flex;flex-wrap:wrap;gap:12px;padding:4px 0;">';
            models.forEach(function(m) {
                var col = statusColor[m.status] || '#9e9e9e';
                var icon = disciplineIcon[m.discipline] || '📄';
                var viewerLink = m.status === 'Ready'
                    ? '<a href="/app/bim-model/' + m.name + '" style="color:#1976d2;font-size:11px;">Open Viewer →</a>'
                    : '<span style="font-size:11px;color:#aaa;">' + m.status + '</span>';
                html = html + '<div style="border:1px solid #e0e0e0;border-radius:6px;padding:10px 14px;min-width:180px;max-width:220px;background:#fff;">';
                html = html + '<div style="font-size:16px;margin-bottom:4px;">' + icon + '</div>';
                html = html + '<div style="font-weight:600;font-size:13px;color:#333;margin-bottom:2px;">' + m.model_name + '</div>';
                html = html + '<div style="font-size:11px;color:#666;margin-bottom:6px;">' + m.discipline + ' • v' + (m.version || '1.0') + '</div>';
                html = html + '<div style="display:inline-block;background:' + col + ';color:#fff;border-radius:3px;padding:2px 7px;font-size:10px;margin-bottom:6px;">' + m.status + '</div><br>';
                html = html + viewerLink;
                html = html + '</div>';
            });
            html = html + '</div>';
            container.innerHTML = html;
        }
    });
}