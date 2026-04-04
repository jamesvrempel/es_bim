// Client Script: BIM Project - Cost Summary
// DocType: BIM Project
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 3 — Cost Summary panel on BIM Project form
// Renders budget vs actual by category, overall contingency usage,
// and top variance items. Adds 'New Cost Item' to BIM Actions menu.

frappe.ui.form.on('BIM Project', {
    refresh: function(frm) {
        if (frm.doc.name && !frm.doc.__islocal) {
            loadProjectCostSummary(frm);
            frm.add_custom_button(__('New Cost Item'), function() {
                frappe.new_doc('BIM Cost Item', { bim_project: frm.doc.name });
            }, __('BIM Actions'));
            frm.add_custom_button(__('All Cost Items'), function() {
                frappe.route_options = { bim_project: frm.doc.name };
                frappe.set_route('List', 'BIM Cost Item');
            }, __('BIM Actions'));
        }
    }
});

function loadProjectCostSummary(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Cost Item',
            filters: { bim_project: frm.doc.name },
            fields: ['name','description','cost_category','status',
                     'budgeted_cost','actual_cost','variance','uom','budgeted_qty'],
            order_by: 'cost_category asc',
            limit: 500
        },
        callback: function(r) {
            renderProjectCostSummary(frm, r.message || []);
        }
    });
}

function renderProjectCostSummary(frm, items) {
    // Find or create container after schedule summary panel
    var existing = document.getElementById('bim-project-cost-panel');
    if (existing) existing.remove();

    var wrapper = frm.get_field('model_summary_html') &&
                  frm.get_field('model_summary_html').$wrapper;
    if (!wrapper) return;

    if (!items.length) {
        var empty = document.createElement('div');
        empty.id = 'bim-project-cost-panel';
        empty.style.cssText = 'margin-top:14px;padding:12px 16px;border:1px solid #e0e0e0;border-radius:6px;color:#aaa;font-style:italic;font-size:13px;';
        empty.textContent = 'No cost items yet. Use “BIM Actions → New Cost Item” to build the 5D cost plan.';
        wrapper[0].parentNode.appendChild(empty);
        return;
    }

    // Aggregate
    var totalBudget = 0;
    var totalActual = 0;
    var cats = {};
    var topVariance = [];

    items.forEach(function(c) {
        var b = c.budgeted_cost || 0;
        var a = c.actual_cost || 0;
        var v = c.variance || 0;
        totalBudget = totalBudget + b;
        totalActual = totalActual + a;
        var cat = c.cost_category || 'Other';
        if (!cats[cat]) cats[cat] = { budget:0, actual:0 };
        cats[cat].budget = cats[cat].budget + b;
        cats[cat].actual = cats[cat].actual + a;
        if (Math.abs(v) > 5000) topVariance.push(c);
    });
    var totalVariance = totalActual - totalBudget;
    topVariance.sort(function(a,b) { return Math.abs(b.variance||0) - Math.abs(a.variance||0); });
    topVariance = topVariance.slice(0, 5);

    var contractVal = frm.doc.contract_value || 0;
    var contractPct = contractVal > 0 ? Math.round(totalBudget / contractVal * 100) : 0;

    function fmt(v) {
        var abs = Math.abs(v);
        var s = abs >= 1000000 ? '$' + (abs/1000000).toFixed(2) + 'M' :
                abs >= 1000    ? '$' + (abs/1000).toFixed(0) + 'k' : '$' + abs.toFixed(0);
        return (v < 0 ? '-' : '') + s;
    }

    var varColor = totalVariance > 0 ? '#e53935' : (totalVariance < 0 ? '#388e3c' : '#888');

    var html = '<div id="bim-project-cost-panel" style="margin-top:14px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">';
    html = html + '<div style="background:#1a3a2a;color:#fff;padding:10px 16px;font-weight:600;font-size:13px;">&#128176; 5D Cost Summary</div>';

    // Metric cards
    html = html + '<div style="display:flex;flex-wrap:wrap;gap:1px;background:#e0e0e0;">';
    var mets = [
        { label:'Contract Value', value: fmt(contractVal), color:'#555' },
        { label:'Total Budget', value: fmt(totalBudget), color:'#1976d2' },
        { label:'Actual Cost', value: fmt(totalActual), color:'#388e3c' },
        { label:'Variance', value: (totalVariance>=0?'+':'')+fmt(totalVariance), color: varColor },
        { label:'Budget / Contract', value: contractPct+'%', color:'#7c4dff' }
    ];
    mets.forEach(function(m) {
        html = html + '<div style="flex:1;min-width:100px;background:#fff;padding:10px 12px;text-align:center;">' +
            '<div style="font-size:18px;font-weight:700;color:' + m.color + ';">' + m.value + '</div>' +
            '<div style="font-size:11px;color:#888;margin-top:2px;">' + m.label + '</div></div>';
    });
    html = html + '</div>';

    // Budget by category bar chart (CSS only)
    html = html + '<div style="padding:12px 16px;background:#fff;border-top:1px solid #f0f0f0;">';
    html = html + '<div style="font-size:11px;font-weight:600;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;">Budget by Category</div>';
    var CAT_COLORS = { 'Civil & Earthworks':'#ef6c00','Structural':'#1565c0','Architectural':'#6a1b9a','Fa\u00e7ade':'#00838f','Mechanical':'#2e7d32','Electrical':'#f9a825','Plumbing':'#4527a0','Preliminaries':'#546e7a','Contingency':'#c62828','Professional Fees':'#4e342e','External Works':'#33691e' };
    Object.keys(cats).sort().forEach(function(cat) {
        var b = cats[cat].budget;
        var a = cats[cat].actual;
        var pct = totalBudget > 0 ? Math.round(b / totalBudget * 100) : 0;
        var actualPct = b > 0 ? Math.min(100, Math.round(a / b * 100)) : 0;
        var col = CAT_COLORS[cat] || '#546e7a';
        html = html + '<div style="margin-bottom:7px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:2px;">' +
            '<span>' + cat + '</span>' +
            '<span>' + fmt(b) + (a > 0 ? ' &nbsp;<span style="color:' + (a>b?'#e53935':'#388e3c') + ';">actual: ' + fmt(a) + '</span>' : '') + '</span>' +
            '</div>' +
            '<div style="background:#e0e0e0;border-radius:3px;height:8px;position:relative;">' +
            '<div style="background:' + col + ';height:100%;width:' + pct + '%;border-radius:3px;opacity:0.7;"></div>' +
            (actualPct > 0 ? '<div style="position:absolute;top:0;left:0;height:100%;width:' + actualPct + '%;background:' + col + ';border-radius:3px;"></div>' : '') +
            '</div></div>';
    });
    html = html + '</div>';

    // Top variances
    if (topVariance.length) {
        html = html + '<div style="padding:10px 16px;background:#fff;border-top:1px solid #f0f0f0;">';
        html = html + '<div style="font-size:11px;font-weight:600;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Notable Variances</div>';
        topVariance.forEach(function(c) {
            var v = c.variance || 0;
            var vColor = v > 0 ? '#e53935' : '#388e3c';
            html = html + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #f5f5f5;">' +
                '<span>' + c.description + '</span>' +
                '<span style="font-weight:600;color:' + vColor + ';">' + (v>=0?'+':'') + fmt(v) + '</span>' +
                '</div>';
        });
        html = html + '</div>';
    }

    html = html + '</div>';

    var panel = document.createElement('div');
    panel.innerHTML = html;
    wrapper[0].parentNode.appendChild(panel.firstChild);
}