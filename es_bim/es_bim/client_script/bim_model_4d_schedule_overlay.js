// Client Script: BIM Model - 4D Schedule Overlay
// DocType: BIM Model
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 2 — 4D Schedule Overlay for BIM Model form
// Injects a collapsible 4D panel below the xeokit viewer containing:
//   - A mini Gantt chart (pure HTML/CSS, no library dependency)
//   - A date scrubber to simulate construction sequence
//   - Colour-coded element overlay synced to xeokit viewer
// Status colours: Not Started=grey, In Progress=blue, Complete=green, Overdue=red, On Hold=amber

frappe.ui.form.on('BIM Model', {
    refresh: function(frm) {
        if (frm.doc.bim_project && !frm.doc.__islocal) {
            // Inject the 4D panel after the viewer section (after a short delay
            // so the viewer HTML field is already in the DOM)
            setTimeout(function() { init4DPanel(frm); }, 600);
        }
    }
});

// ---- Colour map for xeokit overlay ----
var STATUS_COLORS = {
    'Not Started': [0.55, 0.55, 0.55],   // grey
    'In Progress':  [0.13, 0.59, 0.95],  // blue
    'Complete':     [0.30, 0.69, 0.31],  // green
    'Overdue':      [0.90, 0.23, 0.21],  // red
    'On Hold':      [0.98, 0.65, 0.14]   // amber
};

var STATUS_HEX = {
    'Not Started': '#8c8c8c',
    'In Progress':  '#2196F3',
    'Complete':     '#4CAF50',
    'Overdue':      '#E53935',
    'On Hold':      '#FB8C00'
};

// ---- Cached schedule data ----
var _scheduleItems = [];
var _projectStart  = null;
var _projectEnd    = null;

function init4DPanel(frm) {
    // Avoid duplicate injection
    if (document.getElementById('bim-4d-panel')) return;

    var container = document.getElementById('bim-viewer-root');
    if (!container) return;

    // Build the panel HTML
    var panelHtml =
        '<div id="bim-4d-panel" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">' +
        '  <div id="bim-4d-header" style="background:#1e2a3a;color:#fff;padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;" onclick="toggle4DPanel()">' +
        '    <span style="font-weight:600;font-size:13px;">&#9201; 4D Construction Schedule</span>' +
        '    <span id="bim-4d-toggle-icon" style="font-size:16px;">&#9660;</span>' +
        '  </div>' +
        '  <div id="bim-4d-body" style="background:#fff;padding:16px;">' +
        '    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">' +
        '      <label style="font-size:12px;color:#555;">Simulate date:</label>' +
        '      <input type="range" id="bim-4d-scrubber" min="0" max="100" value="0" style="flex:1;min-width:180px;" oninput="onScrubberMove(this.value)">' +
        '      <span id="bim-4d-scrubber-date" style="font-size:12px;font-weight:600;min-width:90px;">--</span>' +
        '      <button onclick="apply4DOverlay()" style="font-size:12px;padding:4px 12px;border:1px solid #1976d2;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;">Apply to Model</button>' +
        '      <button onclick="reset4DOverlay()" style="font-size:12px;padding:4px 12px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#555;cursor:pointer;">Reset Colours</button>' +
        '    </div>' +
        '    <div id="bim-4d-legend" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:11px;">' +
        '      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#8c8c8c;display:inline-block;"></span>Not Started</span>' +
        '      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#2196F3;display:inline-block;"></span>In Progress</span>' +
        '      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#4CAF50;display:inline-block;"></span>Complete</span>' +
        '      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#E53935;display:inline-block;"></span>Overdue</span>' +
        '      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#FB8C00;display:inline-block;"></span>On Hold</span>' +
        '    </div>' +
        '    <div id="bim-4d-gantt" style="overflow-x:auto;">' +
        '      <div style="color:#aaa;font-size:12px;font-style:italic;">Loading schedule…</div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    // Insert panel after viewer container
    container.insertAdjacentHTML('afterend', panelHtml);

    // Load schedule data
    loadScheduleData(frm);
}

window.toggle4DPanel = function() {
    var body = document.getElementById('bim-4d-body');
    var icon = document.getElementById('bim-4d-toggle-icon');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        if (icon) icon.innerHTML = '&#9660;';
    } else {
        body.style.display = 'none';
        if (icon) icon.innerHTML = '&#9654;';
    }
};

function loadScheduleData(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Schedule Item',
            filters: { bim_project: frm.doc.bim_project },
            fields: ['name','task_name','wbs_code','status','planned_start','planned_end',
                     'actual_start','actual_end','progress_pct','trade','sequence_order','elements'],
            order_by: 'sequence_order asc, planned_start asc',
            limit: 200
        },
        callback: function(r) {
            _scheduleItems = r.message || [];
            if (!_scheduleItems.length) {
                var gantt = document.getElementById('bim-4d-gantt');
                if (gantt) gantt.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No schedule items found for this project. Create BIM Schedule Items to enable 4D simulation.</div>';
                return;
            }
            // Determine project date range
            var starts = _scheduleItems.map(function(i) { return i.planned_start; }).filter(Boolean).sort();
            var ends   = _scheduleItems.map(function(i) { return i.planned_end;   }).filter(Boolean).sort();
            _projectStart = starts[0];
            _projectEnd   = ends[ends.length - 1];
            renderGantt();
            // Set scrubber to today
            var today = frappe.datetime.get_today();
            var pct   = dateToPercent(today);
            var scrubber = document.getElementById('bim-4d-scrubber');
            if (scrubber) { scrubber.value = pct; updateScrubberLabel(pct); }
        }
    });
}

// ---- Gantt renderer ----
function renderGantt() {
    var gantt = document.getElementById('bim-4d-gantt');
    if (!gantt || !_scheduleItems.length) return;

    var totalDays = daysBetween(_projectStart, _projectEnd) || 1;

    var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px;">';
    html = html + '<thead><tr style="background:#f5f5f5;">';
    html = html + '<th style="text-align:left;padding:5px 8px;width:28%;border-bottom:1px solid #e0e0e0;">Task</th>';
    html = html + '<th style="text-align:left;padding:5px 8px;width:8%;border-bottom:1px solid #e0e0e0;">WBS</th>';
    html = html + '<th style="text-align:left;padding:5px 8px;width:8%;border-bottom:1px solid #e0e0e0;">Status</th>';
    html = html + '<th style="text-align:left;padding:5px 8px;width:8%;border-bottom:1px solid #e0e0e0;">Progress</th>';
    html = html + '<th style="text-align:left;padding:5px 8px;width:48%;border-bottom:1px solid #e0e0e0;">Timeline</th>';
    html = html + '</tr></thead><tbody>';

    _scheduleItems.forEach(function(item, idx) {
        var rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';
        var statusCol = STATUS_HEX[item.status] || '#8c8c8c';
        var pct = item.progress_pct || 0;

        // Bar position
        var barLeft  = totalDays > 0 ? (daysBetween(_projectStart, item.planned_start) / totalDays * 100) : 0;
        var barWidth = totalDays > 0 ? (daysBetween(item.planned_start, item.planned_end) / totalDays * 100) : 4;
        barLeft  = Math.max(0, Math.min(barLeft, 98));
        barWidth = Math.max(1, Math.min(barWidth, 100 - barLeft));

        // Actual bar overlay
        var actualBar = '';
        if (item.actual_start) {
            var aEnd   = item.actual_end || frappe.datetime.get_today();
            var aLeft  = totalDays > 0 ? (daysBetween(_projectStart, item.actual_start) / totalDays * 100) : 0;
            var aWidth = totalDays > 0 ? (daysBetween(item.actual_start, aEnd) / totalDays * 100) : 2;
            aLeft  = Math.max(0, Math.min(aLeft, 98));
            aWidth = Math.max(1, Math.min(aWidth, 100 - aLeft));
            actualBar = '<div style="position:absolute;top:70%;height:30%;left:' + aLeft + '%;width:' + aWidth + '%;background:rgba(0,0,0,0.35);border-radius:2px;"></div>';
        }

        // Progress fill inside planned bar
        var progressFill = '<div style="position:absolute;top:0;left:0;height:100%;width:' + pct + '%;background:rgba(255,255,255,0.35);border-radius:3px 0 0 3px;"></div>';

        html = html + '<tr style="background:' + rowBg + ';">';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + (item.task_name || '') + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#888;">' + (item.wbs_code || '') + '</td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;"><span style="background:' + statusCol + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + item.status + '</span></td>';
        html = html + '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">';
        html = html + '<div style="background:#e0e0e0;border-radius:3px;height:8px;width:60px;display:inline-block;vertical-align:middle;position:relative;"><div style="background:' + statusCol + ';height:100%;width:' + pct + '%;border-radius:3px;"></div></div>';
        html = html + ' <span style="color:#555;">' + Math.round(pct) + '%</span>';
        html = html + '</td>';
        // Timeline bar
        html = html + '<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;"><div style="position:relative;height:20px;background:#f0f0f0;border-radius:3px;overflow:hidden;">';
        html = html + '<div style="position:absolute;top:0;left:' + barLeft + '%;width:' + barWidth + '%;height:100%;background:' + statusCol + ';border-radius:3px;opacity:0.85;">' + progressFill + '</div>';
        html = html + actualBar;
        html = html + '</div></td>';
        html = html + '</tr>';
    });

    html = html + '</tbody></table>';

    // Timeline header: month labels
    var startDate  = new Date(_projectStart);
    var endDate    = new Date(_projectEnd);
    var monthLabel = '<div style="display:flex;font-size:10px;color:#888;margin-top:4px;padding-left:calc(28% + 8% + 8% + 8% + 8px);">';
    var cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    var months = [];
    while (cursor <= endDate) {
        var pctPos = daysBetween(_projectStart, cursor.toISOString().slice(0,10)) / totalDays * 100;
        months.push({ label: cursor.toLocaleString('default',{month:'short'}) + ' ' + cursor.getFullYear(), pct: pctPos });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    months.forEach(function(m, i) {
        var w = i < months.length - 1 ? (months[i+1].pct - m.pct) : (100 - m.pct);
        monthLabel = monthLabel + '<span style="width:' + w + '%;overflow:hidden;white-space:nowrap;">' + m.label + '</span>';
    });
    monthLabel = monthLabel + '</div>';

    gantt.innerHTML = html + monthLabel;
}

// ---- Date scrubber ----
function dateToPercent(dateStr) {
    if (!_projectStart || !_projectEnd || !dateStr) return 0;
    var total = daysBetween(_projectStart, _projectEnd);
    if (total <= 0) return 0;
    var elapsed = daysBetween(_projectStart, dateStr);
    return Math.max(0, Math.min(100, Math.round(elapsed / total * 100)));
}

function percentToDate(pct) {
    if (!_projectStart || !_projectEnd) return '--';
    var total = daysBetween(_projectStart, _projectEnd);
    var d = new Date(_projectStart);
    d.setDate(d.getDate() + Math.round(total * pct / 100));
    return d.toISOString().slice(0, 10);
}

function updateScrubberLabel(pct) {
    var label = document.getElementById('bim-4d-scrubber-date');
    if (label) label.textContent = percentToDate(pct);
}

window.onScrubberMove = function(val) {
    updateScrubberLabel(parseFloat(val));
};

// ---- Apply 4D overlay to xeokit viewer ----
window.apply4DOverlay = function() {
    if (!window._bimViewer) {
        frappe.show_alert({ message: 'Viewer not initialised — load a Ready model first', indicator: 'orange' }, 4);
        return;
    }
    var scrubber = document.getElementById('bim-4d-scrubber');
    var simDate  = scrubber ? percentToDate(parseFloat(scrubber.value)) : frappe.datetime.get_today();

    // Compute status for each item at simDate
    var guidStatusMap = {};
    _scheduleItems.forEach(function(item) {
        var effectiveStatus = computeStatusAtDate(item, simDate);
        var col = STATUS_COLORS[effectiveStatus] || STATUS_COLORS['Not Started'];
        // elements is an array of child rows
        var elems = item.elements || [];
        elems.forEach(function(el) {
            if (el.ifc_guid) {
                guidStatusMap[el.ifc_guid] = col;
            }
        });
    });

    // Apply colours in xeokit
    var objects = window._bimViewer.scene.objects;
    var hitCount = 0;
    Object.keys(guidStatusMap).forEach(function(guid) {
        if (objects[guid]) {
            objects[guid].colorize = guidStatusMap[guid];
            hitCount = hitCount + 1;
        }
    });

    frappe.show_alert({
        message: '4D overlay applied at ' + simDate + ' (' + hitCount + ' elements coloured)',
        indicator: hitCount > 0 ? 'green' : 'orange'
    }, 4);
};

window.reset4DOverlay = function() {
    if (!window._bimViewer) return;
    var objects = window._bimViewer.scene.objects;
    Object.values(objects).forEach(function(obj) {
        obj.colorize = null;
    });
    frappe.show_alert({ message: 'Model colours reset', indicator: 'blue' }, 2);
};

// ---- Derive simulated status at a given date ----
function computeStatusAtDate(item, simDate) {
    var ps = item.planned_start;
    var pe = item.planned_end;
    var as = item.actual_start;
    if (!ps || !pe) return 'Not Started';
    if (simDate < ps) return 'Not Started';
    if (simDate > pe && !as) return 'Overdue';
    if (simDate >= ps && simDate <= pe) return 'In Progress';
    if (simDate > pe && as) return 'Complete';
    return item.status;
}

// ---- Utility: days between two ISO date strings ----
function daysBetween(a, b) {
    if (!a || !b) return 0;
    var da = new Date(a);
    var db = new Date(b);
    return Math.round((db - da) / 86400000);
}