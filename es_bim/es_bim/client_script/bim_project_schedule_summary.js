// Client Script: BIM Project - Schedule Summary
// DocType: BIM Project
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 2 — Schedule Summary panel on BIM Project form
// Renders a programme health summary: task counts by status,
// overall progress bar, overdue count, and a schedule table.
// Also adds a 'New Schedule Item' custom button.

frappe.ui.form.on('BIM Project', {
    refresh: function(frm) {
        if (frm.doc.name && !frm.doc.__islocal) {
            loadScheduleSummary(frm);
            // Update BIM Level when schedule items exist
            frm.add_custom_button(__('New Schedule Item'), function() {
                frappe.new_doc('BIM Schedule Item', { bim_project: frm.doc.name });
            }, __('BIM Actions'));

            frm.add_custom_button(__('Schedule List'), function() {
                frappe.route_options = { bim_project: frm.doc.name };
                frappe.set_route('List', 'BIM Schedule Item');
            }, __('BIM Actions'));
        }
    }
});

function loadScheduleSummary(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Schedule Item',
            filters: { bim_project: frm.doc.name },
            fields: ['name','task_name','wbs_code','status','planned_start','planned_end',
                     'progress_pct','trade','sequence_order'],
            order_by: 'sequence_order asc, planned_start asc',
            limit: 200
        },
        callback: function(r) {
            var items = r.message || [];
            renderScheduleSummary(frm, items);
        }
    });
}

function renderScheduleSummary(frm, items) {
    // Find or create the schedule summary container in the BIM Models section
    // We append it after the model_summary_html field wrapper
    var wrapper = frm.get_field('model_summary_html') &&
                  frm.get_field('model_summary_html').$wrapper;
    if (!wrapper) return;

    var existing = document.getElementById('bim-schedule-summary-panel');
    if (existing) existing.remove();

    var STATUS_HEX = {
        'Not Started': '#8c8c8c',
        'In Progress': '#2196F3',
        'Complete':    '#4CAF50',
        'Overdue':     '#E53935',
        'On Hold':     '#FB8C00'
    };

    if (!items.length) {
        var panel = document.createElement('div');
        panel.id = 'bim-schedule-summary-panel';
        panel.style.cssText = 'margin-top:16px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:6px;color:#aaa;font-style:italic;font-size:13px;';
        panel.textContent = 'No schedule items yet. Use \u201cBIM Actions \u2192 New Schedule Item\u201d to begin building the 4D programme.';
        wrapper[0].parentNode.appendChild(panel);
        return;
    }

    // Aggregate stats
    var counts = { 'Not Started':0, 'In Progress':0, 'Complete':0, 'Overdue':0, 'On Hold':0 };
    var totalPct = 0;
    items.forEach(function(i) {
        counts[i.status] = (counts[i.status] || 0) + 1;
        totalPct = totalPct + (i.progress_pct || 0);
    });
    var avgPct = items.length > 0 ? Math.round(totalPct / items.length) : 0;

    // Today: mark overdue
    var today = frappe.datetime.get_today();
    var overdueCount = items.filter(function(i) {
        return i.planned_end < today && i.status !== 'Complete';
    }).length;

    var html = '<div id="bim-schedule-summary-panel" style="margin-top:16px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">';

    // Header
    html = html + '<div style="background:#1e2a3a;color:#fff;padding:10px 16px;font-weight:600;font-size:13px;">&#9201; 4D Programme Summary</div>';

    // Metrics row
    html = html + '<div style="display:flex;flex-wrap:wrap;gap:1px;background:#e0e0e0;">';
    var metrics = [
        { label:'Total Tasks',    value: items.length,      color:'#1e2a3a' },
        { label:'Complete',       value: counts['Complete'], color:'#4CAF50' },
        { label:'In Progress',    value: counts['In Progress'], color:'#2196F3' },
        { label:'Overdue',        value: overdueCount,       color:'#E53935' },
        { label:'Overall Progress', value: avgPct + '%',    color:'#7c4dff' }
    ];
    metrics.forEach(function(m) {
        html = html + '<div style="flex:1;min-width:100px;background:#fff;padding:10px 14px;text-align:center;">';
        html = html + '<div style="font-size:22px;font-weight:700;color:' + m.color + ';">' + m.value + '</div>';
        html = html + '<div style="font-size:11px;color:#888;margin-top:2px;">' + m.label + '</div>';
        html = html + '</div>';
    });
    html = html + '</div>';

    // Overall progress bar
    html = html + '<div style="padding:10px 16px;background:#fff;border-top:1px solid #f0f0f0;">';
    html = html + '<div style="font-size:11px;color:#888;margin-bottom:4px;">Programme completion</div>';
    html = html + '<div style="background:#e0e0e0;border-radius:4px;height:10px;"><div style="background:#7c4dff;height:100%;width:' + avgPct + '%;border-radius:4px;transition:width .4s;"></div></div>';
    html = html + '</div>';

    // Schedule table
    html = html + '<div style="overflow-x:auto;">';
    html = html + '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html = html + '<thead><tr style="background:#f5f5f5;">';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">WBS</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">Task</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">Trade</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">Start</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">End</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">Status</th>';
    html = html + '<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e0e0e0;">Progress</th>';
    html = html + '</tr></thead><tbody>';

    items.forEach(function(item, idx) {
        var rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';
        var statusCol = STATUS_HEX[item.status] || '#8c8c8c';
        var pct = item.progress_pct || 0;
        var isOverdue = item.planned_end < today && item.status !== 'Complete';
        var rowStyle = isOverdue ? 'background:#fff5f5;' : 'background:' + rowBg + ';';

        html = html + '<tr style="' + rowStyle + '" onclick="frappe.set_route(\u0027Form\u0027,\u0027BIM Schedule Item\u0027,\u0027' + item.name + '\u0027)" style="cursor:pointer;">';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#888;">' + (item.wbs_code || '') + '</td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;font-weight:500;">' + item.task_name + '</td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#666;">' + (item.trade || '') + '</td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#555;">' + (item.planned_start || '') + '</td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#555;">' + (item.planned_end || '') + '</td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;"><span style="background:' + statusCol + ';color:#fff;border-radius:3px;padding:1px 7px;font-size:10px;">' + item.status + '</span></td>';
        html = html + '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">';
        html = html + '<div style="display:flex;align-items:center;gap:5px;"><div style="background:#e0e0e0;border-radius:3px;height:7px;width:50px;"><div style="background:' + statusCol + ';height:100%;width:' + pct + '%;border-radius:3px;"></div></div>';
        html = html + '<span style="color:#555;">' + Math.round(pct) + '%</span></div>';
        html = html + '</td>';
        html = html + '</tr>';
    });

    html = html + '</tbody></table></div></div>';

    var panel = document.createElement('div');
    panel.innerHTML = html;
    wrapper[0].parentNode.appendChild(panel.firstChild);
}