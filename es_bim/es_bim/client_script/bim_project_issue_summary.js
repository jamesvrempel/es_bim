// Client Script: BIM Project - Issue Summary
// DocType: BIM Project
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 4 — Issue Summary on BIM Project form
// Renders a BCF issue health panel: counts by type and priority,
// open critical issues list, and overdue issue alerts.

frappe.ui.form.on('BIM Project', {
    refresh: function(frm) {
        if (frm.doc.name && !frm.doc.__islocal) {
            loadIssueProjectSummary(frm);
            frm.add_custom_button(__('New Issue'), function() {
                frappe.new_doc('BIM Issue', { bim_project: frm.doc.name });
            }, __('BIM Actions'));
            frm.add_custom_button(__('All Issues'), function() {
                frappe.route_options = { bim_project: frm.doc.name };
                frappe.set_route('List', 'BIM Issue');
            }, __('BIM Actions'));
            frm.add_custom_button(__('Floor Plans'), function() {
                frappe.route_options = { bim_project: frm.doc.name };
                frappe.set_route('List', 'BIM Floor Plan');
            }, __('BIM Actions'));
            frm.add_custom_button(__('IoT Sensor Links'), function() {
                frappe.route_options = { bim_project: frm.doc.name };
                frappe.set_route('List', 'BIM IoT Sensor Link');
            }, __('BIM Actions'));
        }
    }
});

function loadIssueProjectSummary(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Issue',
            filters: { bim_project: frm.doc.name },
            fields: ['name','issue_title','issue_type','priority','status','due_date','discipline'],
            order_by: 'creation desc',
            limit: 200
        },
        callback: function(r) {
            renderIssueProjectPanel(frm, r.message || []);
        }
    });
}

function renderIssueProjectPanel(frm, issues) {
    var existing = document.getElementById('bim-project-issue-panel');
    if (existing) existing.remove();

    var wrapper = frm.get_field('model_summary_html') &&
                  frm.get_field('model_summary_html').$wrapper;
    if (!wrapper) return;

    if (!issues.length) {
        var empty = document.createElement('div');
        empty.id = 'bim-project-issue-panel';
        empty.style.cssText = 'margin-top:14px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:6px;color:#aaa;font-style:italic;font-size:13px;';
        empty.textContent = 'No issues yet. Use \u201cBIM Actions \u2192 New Issue\u201d to log clash detections or design queries.';
        wrapper[0].parentNode.appendChild(empty);
        return;
    }

    var today = frappe.datetime.get_today();
    var PRIORITY_COLOR = {'Critical':'#b71c1c','High':'#e53935','Medium':'#fb8c00','Low':'#43a047'};
    var STATUS_COLOR   = {'Open':'#1976d2','In Review':'#7c4dff','Resolved':'#388e3c','Closed':'#546e7a','Wont Fix':'#9e9e9e'};
    var TYPE_ICON      = {'Clash':'⚠️','Design Query':'❓','Field Observation':'📍','RFI':'📨','Non-Conformance':'🚧','Safety Hazard':'⛔','Quality Hold':'🔒'};

    // Aggregate
    var open = 0; var resolved = 0; var critical = 0; var overdue = [];
    var byType = {}; var byPriority = {};
    issues.forEach(function(i) {
        if (i.status === 'Open' || i.status === 'In Review') { open = open + 1; }
        if (i.status === 'Resolved' || i.status === 'Closed') { resolved = resolved + 1; }
        if (i.priority === 'Critical') { critical = critical + 1; }
        if (i.due_date && i.due_date < today && i.status === 'Open') overdue.push(i);
        byType[i.issue_type] = (byType[i.issue_type]||0) + 1;
        byPriority[i.priority] = (byPriority[i.priority]||0) + 1;
    });

    var html = '<div id="bim-project-issue-panel" style="margin-top:14px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">';
    html = html + '<div style="background:#2a1a3a;color:#fff;padding:10px 16px;font-weight:600;font-size:13px;">&#9888;&#65039; BCF Issue Health</div>';

    // Metric cards
    html = html + '<div style="display:flex;flex-wrap:wrap;gap:1px;background:#e0e0e0;">';
    var mets = [
        {label:'Total',    value:issues.length, color:'#333'},
        {label:'Open',     value:open,     color:'#1976d2'},
        {label:'Resolved', value:resolved,  color:'#388e3c'},
        {label:'Critical', value:critical,  color:'#b71c1c'},
        {label:'Overdue',  value:overdue.length, color: overdue.length > 0 ? '#e53935' : '#9e9e9e'}
    ];
    mets.forEach(function(m) {
        html = html + '<div style="flex:1;min-width:80px;background:#fff;padding:9px 12px;text-align:center;">' +
            '<div style="font-size:20px;font-weight:700;color:' + m.color + ';">' + m.value + '</div>' +
            '<div style="font-size:11px;color:#888;">' + m.label + '</div></div>';
    });
    html = html + '</div>';

    // By type breakdown
    html = html + '<div style="padding:10px 16px;background:#fff;border-top:1px solid #f0f0f0;display:flex;flex-wrap:wrap;gap:8px;">';
    Object.keys(byType).forEach(function(t) {
        var icon = TYPE_ICON[t] || '📌';
        html = html + '<div style="background:#f5f5f5;border-radius:12px;padding:3px 10px;font-size:11px;">' + icon + ' ' + t + ': <strong>' + byType[t] + '</strong></div>';
    });
    html = html + '</div>';

    // Overdue alert
    if (overdue.length > 0) {
        html = html + '<div style="background:#fff8e1;border-top:2px solid #fb8c00;padding:8px 16px;">';
        html = html + '<div style="font-size:11px;font-weight:600;color:#e65100;margin-bottom:4px;">&#9888; ' + overdue.length + ' overdue open issue(s)</div>';
        overdue.slice(0,3).forEach(function(i) {
            html = html + '<div style="font-size:11px;color:#bf360c;padding:2px 0;">&bull; ' + i.issue_title + ' (due ' + i.due_date + ')</div>';
        });
        html = html + '</div>';
    }

    // Recent issues table
    html = html + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html = html + '<thead><tr style="background:#f5f5f5;"><th style="padding:5px 10px;text-align:left;border-bottom:1px solid #e0e0e0;">Type</th><th style="padding:5px 10px;text-align:left;border-bottom:1px solid #e0e0e0;">Title</th><th style="padding:5px 10px;text-align:left;border-bottom:1px solid #e0e0e0;">Priority</th><th style="padding:5px 10px;text-align:left;border-bottom:1px solid #e0e0e0;">Status</th><th style="padding:5px 10px;text-align:left;border-bottom:1px solid #e0e0e0;">Discipline</th></tr></thead><tbody>';
    issues.slice(0,10).forEach(function(i,idx) {
        var bg = idx % 2 === 0 ? '#fff' : '#fafafa';
        html = html + '<tr style="background:' + bg + ';cursor:pointer;" onclick="frappe.set_route(\'Form\',\'BIM Issue\',\'' + i.name + '\')">' +
            '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">' + (TYPE_ICON[i.issue_type]||'📌') + ' ' + i.issue_type + '</td>' +
            '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#1976d2;">' + i.issue_title + '</td>' +
            '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;"><span style="background:' + (PRIORITY_COLOR[i.priority]||'#888') + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + i.priority + '</span></td>' +
            '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;"><span style="background:' + (STATUS_COLOR[i.status]||'#888') + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + i.status + '</span></td>' +
            '<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;color:#888;">' + (i.discipline||'') + '</td>' +
            '</tr>';
    });
    html = html + '</tbody></table></div></div>';

    var panel = document.createElement('div');
    panel.innerHTML = html;
    wrapper[0].parentNode.appendChild(panel.firstChild);
}