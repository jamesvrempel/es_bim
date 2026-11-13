// Client Script: BIM Model - 5D Cost Panel
// DocType: BIM Model
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 3 — 5D Cost Panel on BIM Model form
// Injects a collapsible cost panel below the 4D panel with:
//   - IFC Quantity Take-Off button (calls bim_ifc_quantity_takeoff API)
//   - Take-off results table with 'Create Cost Item' action per row
//   - Live cost summary: budgeted vs actual by category

frappe.ui.form.on('BIM Model', {
    refresh: function(frm) {
        if (frm.doc.bim_project && !frm.doc.__islocal) {
            setTimeout(function() { init5DCostPanel(frm); }, 800);
        }
        // Custom button: open cost list for this project
        if (frm.doc.bim_project) {
            frm.add_custom_button(__('Cost Items'), function() {
                frappe.route_options = { bim_project: frm.doc.bim_project };
                frappe.set_route('List', 'BIM Cost Item');
            }, __('BIM Actions'));
            frm.add_custom_button(__('New Cost Item'), function() {
                frappe.new_doc('BIM Cost Item', { bim_project: frm.doc.bim_project });
            }, __('BIM Actions'));
        }
    }
});

var _costItems = [];
var _takeoffRows = [];

function init5DCostPanel(frm) {
    if (document.getElementById('bim-5d-panel')) return;

    // Find insertion point: after 4D panel if present, else after viewer
    var anchor = document.getElementById('bim-4d-panel') ||
                 document.getElementById('bim-viewer-root');
    if (!anchor) return;

    var html =
        '<div id="bim-5d-panel" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">' +
        '  <div id="bim-5d-header" style="background:#1a3a2a;color:#fff;padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;" onclick="toggle5DPanel()">' +
        '    <span style="font-weight:600;font-size:13px;">&#128176; 5D Cost Management</span>' +
        '    <span id="bim-5d-toggle-icon" style="font-size:16px;">&#9660;</span>' +
        '  </div>' +
        '  <div id="bim-5d-body" style="background:#fff;padding:16px;">' +
        // Metrics row
        '    <div id="bim-5d-metrics" style="display:flex;flex-wrap:wrap;gap:1px;background:#e8e8e8;border-radius:6px;overflow:hidden;margin-bottom:14px;">' +
        '      <div style="flex:1;min-width:110px;background:#fff;padding:10px 14px;text-align:center;"><div id="bim-5d-m-budget" style="font-size:20px;font-weight:700;color:#1976d2;">--</div><div style="font-size:11px;color:#888;">Total Budget</div></div>' +
        '      <div style="flex:1;min-width:110px;background:#fff;padding:10px 14px;text-align:center;"><div id="bim-5d-m-actual" style="font-size:20px;font-weight:700;color:#388e3c;">--</div><div style="font-size:11px;color:#888;">Actual Cost</div></div>' +
        '      <div style="flex:1;min-width:110px;background:#fff;padding:10px 14px;text-align:center;"><div id="bim-5d-m-variance" style="font-size:20px;font-weight:700;color:#888;">--</div><div style="font-size:11px;color:#888;">Variance</div></div>' +
        '      <div style="flex:1;min-width:110px;background:#fff;padding:10px 14px;text-align:center;"><div id="bim-5d-m-items" style="font-size:20px;font-weight:700;color:#7c4dff;">--</div><div style="font-size:11px;color:#888;">Cost Items</div></div>' +
        '    </div>' +
        // Toolbar
        '    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
        '      <button onclick="runQTO(cur_frm)" style="font-size:12px;padding:5px 12px;border:1px solid #1a3a2a;border-radius:4px;background:#1a3a2a;color:#fff;cursor:pointer;">&#128196; IFC Quantity Take-Off</button>' +
        '      <button onclick="load5DCostSummary(cur_frm)" style="font-size:12px;padding:5px 12px;border:1px solid #388e3c;border-radius:4px;background:#388e3c;color:#fff;cursor:pointer;">&#8635; Refresh Cost Summary</button>' +
        '      <button onclick="highlight5DCostItems()" style="font-size:12px;padding:5px 12px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#555;cursor:pointer;">Highlight Over-Budget</button>' +
        '    </div>' +
        // Take-off results area
        '    <div id="bim-5d-qto-result" style="display:none;margin-bottom:14px;"></div>' +
        // Cost summary table
        '    <div id="bim-5d-cost-table"><div style="color:#aaa;font-size:12px;font-style:italic;">Loading cost data…</div></div>' +
        '  </div>' +
        '</div>';

    anchor.insertAdjacentHTML('afterend', html);
    load5DCostSummary(frm);
}

window.toggle5DPanel = function() {
    var body = document.getElementById('bim-5d-body');
    var icon = document.getElementById('bim-5d-toggle-icon');
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
    if (icon) icon.innerHTML = body.style.display === 'none' ? '&#9654;' : '&#9660;';
};

// ---- Load cost summary from BIM Cost Items ----
window.load5DCostSummary = function(frm) {
    var project = frm ? frm.doc.bim_project : (cur_frm ? cur_frm.doc.bim_project : null);
    if (!project) return;
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Cost Item',
            filters: { bim_project: project },
            fields: ['name','description','cost_category','status','uom',
                     'budgeted_qty','actual_qty','unit_rate','budgeted_cost',
                     'actual_cost','variance','item_code','floor_levels'],
            order_by: 'cost_category asc',
            limit: 500
        },
        callback: function(r) {
            _costItems = r.message || [];
            render5DCostMetrics();
            render5DCostTable();
        }
    });
};

function render5DCostMetrics() {
    var totalBudget = 0;
    var totalActual = 0;
    _costItems.forEach(function(c) {
        totalBudget = totalBudget + (c.budgeted_cost || 0);
        totalActual = totalActual + (c.actual_cost || 0);
    });
    var totalVariance = totalActual - totalBudget;
    var varColor = totalVariance > 0 ? '#e53935' : (totalVariance < 0 ? '#388e3c' : '#888');

    function fmtAUD(v) {
        var abs = Math.abs(v);
        var str;
        if (abs >= 1000000) {
            str = '$' + (abs / 1000000).toFixed(2) + 'M';
        } else if (abs >= 1000) {
            str = '$' + (abs / 1000).toFixed(0) + 'k';
        } else {
            str = '$' + abs.toFixed(0);
        }
        return (v < 0 ? '-' : '') + str;
    }

    var mBudget = document.getElementById('bim-5d-m-budget');
    var mActual = document.getElementById('bim-5d-m-actual');
    var mVariance = document.getElementById('bim-5d-m-variance');
    var mItems = document.getElementById('bim-5d-m-items');
    if (mBudget) mBudget.textContent = fmtAUD(totalBudget);
    if (mActual) mActual.textContent = fmtAUD(totalActual);
    if (mVariance) { mVariance.textContent = (totalVariance >= 0 ? '+' : '') + fmtAUD(totalVariance); mVariance.style.color = varColor; }
    if (mItems)  mItems.textContent = _costItems.length;
}

function render5DCostTable() {
    var container = document.getElementById('bim-5d-cost-table');
    if (!container) return;
    if (!_costItems.length) {
        container.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No cost items yet. Use \'New Cost Item\' or run IFC Quantity Take-Off.</div>';
        return;
    }

    var STATUS_COLOR = { 'Estimate':'#9e9e9e','Budget Approved':'#1976d2','Committed':'#7c4dff','Actual':'#388e3c','Variation':'#f57c00' };

    // Group by category
    var cats = {};
    _costItems.forEach(function(c) {
        var cat = c.cost_category || 'Uncategorised';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(c);
    });

    var html = '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px;">' +
        '<thead><tr style="background:#f5f5f5;">' +
        '<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Description</th>' +
        '<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Status</th>' +
        '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Qty</th>' +
        '<th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">UOM</th>' +
        '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Rate</th>' +
        '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Budget</th>' +
        '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Actual</th>' +
        '<th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Variance</th>' +
        '</tr></thead><tbody>';

    Object.keys(cats).sort().forEach(function(cat) {
        var items = cats[cat];
        var catBudget = 0; var catActual = 0;
        items.forEach(function(c) { catBudget = catBudget + (c.budgeted_cost||0); catActual = catActual + (c.actual_cost||0); });
        var catVar = catActual - catBudget;
        var catVarColor = catVar > 0 ? '#e53935' : (catVar < 0 ? '#388e3c' : '#888');

        // Category sub-header
        html = html + '<tr style="background:#e8f5e9;">' +
            '<td colspan="5" style="padding:5px 8px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#2e7d32;">' + cat + '</td>' +
            '<td style="text-align:right;padding:5px 8px;font-weight:600;color:#333;">$' + catBudget.toLocaleString('en-AU',{maximumFractionDigits:0}) + '</td>' +
            '<td style="text-align:right;padding:5px 8px;font-weight:600;color:#333;">$' + catActual.toLocaleString('en-AU',{maximumFractionDigits:0}) + '</td>' +
            '<td style="text-align:right;padding:5px 8px;font-weight:600;color:' + catVarColor + ';">' + (catVar >= 0 ? '+' : '') + '$' + catVar.toLocaleString('en-AU',{maximumFractionDigits:0}) + '</td>' +
            '</tr>';

        items.forEach(function(c, idx) {
            var bg = idx % 2 === 0 ? '#fff' : '#fafafa';
            var statusCol = STATUS_COLOR[c.status] || '#9e9e9e';
            var v = c.variance || 0;
            var vColor = v > 1000 ? '#e53935' : (v < -1000 ? '#388e3c' : '#888');
            var vStr = (v >= 0 ? '+' : '') + '$' + v.toLocaleString('en-AU',{maximumFractionDigits:0});

            html = html + '<tr style="background:' + bg + ';cursor:pointer;" onclick="frappe.set_route(\'Form\',\'BIM Cost Item\',\'' + c.name + '\')">' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + c.description + (c.floor_levels ? ' <span style="color:#aaa;font-size:10px;">[' + c.floor_levels + ']</span>' : '') + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;"><span style="background:' + statusCol + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + c.status + '</span></td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#555;">' + (c.budgeted_qty||0).toLocaleString('en-AU',{maximumFractionDigits:1}) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#888;">' + (c.uom||'') + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#555;">$' + (c.unit_rate||0).toLocaleString('en-AU',{maximumFractionDigits:2}) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;">$' + (c.budgeted_cost||0).toLocaleString('en-AU',{maximumFractionDigits:0}) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#388e3c;">$' + (c.actual_cost||0).toLocaleString('en-AU',{maximumFractionDigits:0}) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;color:' + vColor + ';">' + vStr + '</td>' +
                '</tr>';
        });
    });

    html = html + '</tbody></table></div>';
    container.innerHTML = html;
}

// ---- IFC Quantity Take-Off ----
window.runQTO = function(frm) {
    if (!frm || !frm.doc.name) return;
    if (frm.doc.status !== 'Ready') {
        frappe.show_alert({ message: 'Model must be in Ready status to run take-off', indicator: 'orange' }, 4);
        return;
    }
    var qtoDiv = document.getElementById('bim-5d-qto-result');
    if (qtoDiv) { qtoDiv.style.display = 'block'; qtoDiv.innerHTML = '<div style="color:#555;font-size:12px;">&#8987; Running IFC quantity take-off…</div>'; }

    frappe.call({
        method: 'bim_ifc_quantity_takeoff',
        args: { model_name: frm.doc.name },
        callback: function(r) {
            var result = r.message;
            if (!result || result.error) {
                if (qtoDiv) qtoDiv.innerHTML = '<div style="color:#e53935;font-size:12px;">Error: ' + (result ? result.error : 'Unknown') + '</div>';
                return;
            }
            _takeoffRows = result.rows || [];
            renderQTOTable(frm, result);
        }
    });
};

function renderQTOTable(frm, result) {
    var qtoDiv = document.getElementById('bim-5d-qto-result');
    if (!qtoDiv) return;
    var rows = result.rows || [];
    var method = result.method || '';
    var isMock = method === 'fallback_mock';

    var html = '<div style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin-bottom:8px;">';
    html = html + '<div style="background:#f5f5f5;padding:8px 12px;font-size:12px;font-weight:600;display:flex;justify-content:space-between;align-items:center;">';
    html = html + '<span>&#128196; Take-Off Results (' + rows.length + ' rows' + (isMock ? ' — mock data: upload IFC to get real quantities' : '') + ')</span>';
    html = html + '<span style="cursor:pointer;color:#aaa;font-size:16px;" onclick="document.getElementById(\'bim-5d-qto-result\').style.display=\'none\'">&#10005;</span>';
    html = html + '</div>';
    html = html + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html = html + '<thead><tr style="background:#fafafa;"><th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">IFC Type</th><th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Quantity</th><th style="text-align:right;padding:5px 8px;border-bottom:1px solid #e0e0e0;">Total</th><th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e0e0e0;">UOM</th><th style="padding:5px 8px;border-bottom:1px solid #e0e0e0;">Action</th></tr></thead><tbody>';

    rows.forEach(function(row, idx) {
        var bg = idx % 2 === 0 ? '#fff' : '#fafafa';
        var uomStr = row.uom || (row.quantity_name && row.quantity_name.indexOf('Area') >= 0 ? 'Square Meter' : (row.quantity_name && row.quantity_name.indexOf('Volume') >= 0 ? 'Cubic Meter' : 'Unit'));
        html = html + '<tr style="background:' + bg + ';">';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:11px;">' + row.ifc_type + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + row.quantity_name + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:500;">' + (row.total||0).toLocaleString('en-AU',{maximumFractionDigits:2}) + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#888;">' + uomStr + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;">' +
            '<button onclick="createCostFromQTO(' + idx + ',\'' + frm.doc.bim_project + '\',\'' + frm.doc.name + '\')" style="font-size:10px;padding:2px 8px;border:1px solid #1976d2;border-radius:3px;background:#fff;color:#1976d2;cursor:pointer;">+ Cost Item</button>' +
            '</td>';
        html = html + '</tr>';
    });

    html = html + '</tbody></table></div></div>';
    qtoDiv.innerHTML = html;
}

window.createCostFromQTO = function(idx, project, modelName) {
    var row = _takeoffRows[idx];
    if (!row) return;
    var uomStr = row.uom || (row.quantity_name.indexOf('Area') >= 0 ? 'Square Meter' : (row.quantity_name.indexOf('Volume') >= 0 ? 'Cubic Meter' : 'Unit'));
    frappe.new_doc('BIM Cost Item', {
        bim_project: project,
        description: row.ifc_type + ' — ' + row.quantity_name,
        cost_category: 'Structural',
        uom: uomStr,
        budgeted_qty: row.total,
        ifc_source: 'Model Take-Off',
        status: 'Estimate',
        notes: '<p>Auto-populated from IFC take-off on model ' + modelName + '. Source: ' + (row.source||'') + '</p>'
    });
};

// ---- Highlight over-budget elements in xeokit ----
window.highlight5DCostItems = function() {
    if (!window._bimViewer) {
        frappe.show_alert({ message: 'Viewer not initialised', indicator: 'orange' }, 3);
        return;
    }
    var hitCount = 0;
    _costItems.forEach(function(c) {
        if ((c.variance || 0) > 1000 && c.ifc_element_guids) {
            var guids = c.ifc_element_guids.split(/[\s,\n]+/);
            guids.forEach(function(guid) {
                guid = guid.trim();
                if (guid && window._bimViewer.scene.objects[guid]) {
                    window._bimViewer.scene.objects[guid].colorize = [0.9, 0.2, 0.2];
                    hitCount = hitCount + 1;
                }
            });
        }
    });
    frappe.show_alert({ message: 'Highlighted ' + hitCount + ' over-budget elements in red', indicator: hitCount > 0 ? 'red' : 'orange' }, 4);
};