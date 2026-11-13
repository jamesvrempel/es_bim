// Client Script: BIM Model - Phase 4 Panels
// DocType: BIM Model
// ES5 compatible — no const/let/=>/template literals

// ES BIM Phase 4 — BCF Issues + GIS/Floor Plan + IoT + Federation
// Injects three collapsible panels below the existing 5D panel:
//   1. BCF Issue Panel  — clash list, create issue from model click, status board
//   2. GIS & Floor Plan — OpenStreetMap site location + SVG floor plan per level
//   3. IoT Sensor Panel — live beacon readings, colour overlay, alert badges
// Plus: Federation button added to viewer toolbar

frappe.ui.form.on('BIM Model', {
    refresh: function(frm) {
        if (!frm.doc.bim_project || frm.doc.__islocal) return;
        setTimeout(function() {
            injectFederationButton(frm);
            initIssuePanel(frm);
            initGISPanel(frm);
            initIoTPanel(frm);
        }, 1000);

        frm.add_custom_button(__('BIM Issues'), function() {
            frappe.route_options = { bim_project: frm.doc.bim_project };
            frappe.set_route('List', 'BIM Issue');
        }, __('BIM Actions'));
        frm.add_custom_button(__('New Issue from View'), function() {
            createIssueFromViewer(frm);
        }, __('BIM Actions'));
        frm.add_custom_button(__('Federation View'), function() {
            loadFederatedModels(frm);
        }, __('BIM Actions'));
    }
});

// ================================================================
// FEDERATION
// ================================================================
function injectFederationButton(frm) {
    var toolbar = document.getElementById('bim-viewer-toolbar');
    if (!toolbar || document.getElementById('bim-fed-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'bim-fed-btn';
    btn.title = 'Load All Models (Federation)';
    btn.innerHTML = '🔗 Federate';
    btn.style.cssText = 'background:rgba(30,30,50,0.85);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px;';
    btn.onclick = function() { loadFederatedModels(frm); };
    toolbar.appendChild(btn);
}

window.loadFederatedModels = function(frm) {
    if (!window._bimViewer) {
        frappe.show_alert({ message: 'Viewer not initialised', indicator: 'orange' }, 3);
        return;
    }
    frappe.show_alert({ message: 'Loading federated models…', indicator: 'blue' }, 3);
    frappe.call({
        method: 'bim_federation_models',
        args: { bim_project: frm.doc.bim_project },
        callback: function(r) {
            var d = r.message;
            if (!d || !d.models || !d.models.length) {
                frappe.show_alert({ message: 'No Ready models found for federation', indicator: 'orange' }, 4);
                return;
            }
            var viewer = window._bimViewer;
            var loader = new XKTLoaderPlugin(viewer);
            var loaded = 0;
            d.models.forEach(function(m) {
                if (!m.xkt_file || m.name === frm.doc.name) return;
                var model = loader.load({ id: 'fed-' + m.name, src: m.xkt_file, edges: true });
                model.on('loaded', function() {
                    loaded = loaded + 1;
                    frappe.show_alert({ message: '✅ Loaded: ' + m.model_name + ' (' + m.discipline + ')', indicator: 'green' }, 3);
                    if (loaded === d.models.length - 1) {
                        viewer.cameraFlight.flyTo(viewer.scene);
                    }
                });
            });
            frappe.show_alert({ message: 'Federation: loading ' + d.model_count + ' model(s)', indicator: 'blue' }, 4);
        }
    });
};

// ================================================================
// BCF ISSUE PANEL
// ================================================================
var _issues = [];

function initIssuePanel(frm) {
    if (document.getElementById('bim-issue-panel')) return;
    var anchor = document.getElementById('bim-5d-panel') ||
                 document.getElementById('bim-4d-panel') ||
                 document.getElementById('bim-viewer-root');
    if (!anchor) return;

    var PRIORITY_COLOR = { 'Critical':'#b71c1c','High':'#e53935','Medium':'#fb8c00','Low':'#43a047' };
    var STATUS_COLOR   = { 'Open':'#1976d2','In Review':'#7c4dff','Resolved':'#388e3c','Closed':'#546e7a','Wont Fix':'#9e9e9e' };
    var TYPE_ICON      = { 'Clash':'⚠️','Design Query':'❓','Field Observation':'📍','RFI':'📨','Non-Conformance':'🚧','Safety Hazard':'⛔','Quality Hold':'🔒' };

    var html =
        '<div id="bim-issue-panel" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">' +
        '  <div style="background:#2a1a3a;color:#fff;padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="togglePanel(\'bim-issue-body\')">' +
        '    <span style="font-weight:600;font-size:13px;">&#9888;&#65039; BCF Issues &amp; Clash Detection</span>' +
        '    <div style="display:flex;gap:8px;">' +
        '      <button onclick="event.stopPropagation();createIssueFromViewer(cur_frm)" style="font-size:11px;padding:3px 10px;border:1px solid rgba(255,255,255,0.3);border-radius:3px;background:transparent;color:#fff;cursor:pointer;">+ New Issue</button>' +
        '      <span id="bim-issue-toggle" style="font-size:16px;">&#9660;</span>' +
        '    </div>' +
        '  </div>' +
        '  <div id="bim-issue-body" style="background:#fff;padding:14px;">' +
        '    <div id="bim-issue-metrics" style="display:flex;flex-wrap:wrap;gap:1px;background:#e0e0e0;border-radius:5px;overflow:hidden;margin-bottom:12px;"></div>' +
        '    <div id="bim-issue-list"><div style="color:#aaa;font-size:12px;font-style:italic;">Loading issues…</div></div>' +
        '  </div>' +
        '</div>';

    anchor.insertAdjacentHTML('afterend', html);
    loadIssues(frm);
}

function loadIssues(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Issue',
            filters: { bim_project: frm.doc.bim_project },
            fields: ['name','issue_title','issue_type','priority','status',
                     'assigned_to','due_date','floor_level','discipline',
                     'clash_element_a_guid','clash_element_b_guid','creation'],
            order_by: 'creation desc',
            limit: 100
        },
        callback: function(r) {
            _issues = r.message || [];
            renderIssueMetrics();
            renderIssueList();
        }
    });
}

function renderIssueMetrics() {
    var el = document.getElementById('bim-issue-metrics');
    if (!el) return;
    var counts = { 'Open':0,'In Review':0,'Resolved':0,'Closed':0,'Wont Fix':0 };
    var clash_count = 0;
    _issues.forEach(function(i) {
        counts[i.status] = (counts[i.status]||0) + 1;
        if (i.issue_type === 'Clash') clash_count = clash_count + 1;
    });
    var STATUS_COLOR = { 'Open':'#1976d2','In Review':'#7c4dff','Resolved':'#388e3c','Closed':'#546e7a','Wont Fix':'#9e9e9e' };
    var metrics = [
        { label:'Total',     value: _issues.length, color:'#333' },
        { label:'Open',      value: counts['Open'],    color: STATUS_COLOR['Open'] },
        { label:'In Review', value: counts['In Review'],color: STATUS_COLOR['In Review'] },
        { label:'Resolved',  value: counts['Resolved'],color: STATUS_COLOR['Resolved'] },
        { label:'Clashes',   value: clash_count,        color:'#e53935' }
    ];
    var html = '';
    metrics.forEach(function(m) {
        html = html + '<div style="flex:1;min-width:70px;background:#fff;padding:8px 10px;text-align:center;">' +
            '<div style="font-size:20px;font-weight:700;color:' + m.color + ';">' + m.value + '</div>' +
            '<div style="font-size:10px;color:#888;">' + m.label + '</div></div>';
    });
    el.innerHTML = html;
}

function renderIssueList() {
    var el = document.getElementById('bim-issue-list');
    if (!el) return;
    if (!_issues.length) {
        el.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No issues yet. Click \'+ New Issue\' to log a clash or design query.</div>';
        return;
    }
    var PRIORITY_COLOR = {'Critical':'#b71c1c','High':'#e53935','Medium':'#fb8c00','Low':'#43a047'};
    var STATUS_COLOR   = {'Open':'#1976d2','In Review':'#7c4dff','Resolved':'#388e3c','Closed':'#546e7a','Wont Fix':'#9e9e9e'};
    var TYPE_ICON      = {'Clash':'⚠️','Design Query':'❓','Field Observation':'📍','RFI':'📨','Non-Conformance':'🚧','Safety Hazard':'⛔','Quality Hold':'🔒'};
    var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px;">' +
        '<thead><tr style="background:#f5f5f5;">' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Type</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Title</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Priority</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Status</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Level</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Assigned</th>' +
        '<th style="padding:5px 8px;text-align:left;border-bottom:1px solid #e0e0e0;">Actions</th>' +
        '</tr></thead><tbody>';
    _issues.forEach(function(iss, idx) {
        var bg = idx % 2 === 0 ? '#fff' : '#fafafa';
        var pCol = PRIORITY_COLOR[iss.priority] || '#888';
        var sCol = STATUS_COLOR[iss.status] || '#888';
        var icon = TYPE_ICON[iss.issue_type] || '📌';
        html = html + '<tr style="background:' + bg + ';">' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + icon + ' <span style="font-size:10px;color:#888;">' + iss.issue_type + '</span></td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-weight:500;cursor:pointer;color:#1976d2;" onclick="frappe.set_route(\'Form\',\'BIM Issue\',\'' + iss.name + '\')">' + iss.issue_title + '</td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;"><span style="background:' + pCol + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + iss.priority + '</span></td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;"><span style="background:' + sCol + ';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;">' + iss.status + '</span></td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#888;">' + (iss.floor_level||'') + '</td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#666;font-size:11px;">' + (iss.assigned_to||'') + '</td>' +
            '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' +
            (iss.clash_element_a_guid ? '<button onclick="highlightClash(\'' + iss.clash_element_a_guid + '\',\'' + (iss.clash_element_b_guid||'') + '\')" style="font-size:10px;padding:1px 7px;border:1px solid #fb8c00;border-radius:3px;color:#fb8c00;background:#fff;cursor:pointer;">Show</button>' : '') +
            '</td>' +
            '</tr>';
    });
    html = html + '</tbody></table></div>';
    el.innerHTML = html;
}

window.highlightClash = function(guidA, guidB) {
    if (!window._bimViewer) return;
    var objs = window._bimViewer.scene.objects;
    Object.values(objs).forEach(function(o) { o.colorize = null; o.highlighted = false; });
    if (objs[guidA]) { objs[guidA].colorize = [0.9, 0.2, 0.2]; objs[guidA].highlighted = true; }
    if (guidB && objs[guidB]) { objs[guidB].colorize = [0.9, 0.5, 0.1]; objs[guidB].highlighted = true; }
    if (objs[guidA]) window._bimViewer.cameraFlight.flyTo(objs[guidA]);
    frappe.show_alert({ message: 'Clash elements highlighted', indicator: 'orange' }, 3);
};

window.createIssueFromViewer = function(frm) {
    var cam = window._bimViewer ? window._bimViewer.scene.camera : null;
    var vals = {
        bim_project: frm.doc.bim_project,
        bim_model:   frm.doc.name,
        issue_type:  'Clash',
        priority:    'High',
        status:      'Open'
    };
    if (cam) {
        vals.bcf_camera_x = parseFloat(cam.eye[0].toFixed(3));
        vals.bcf_camera_y = parseFloat(cam.eye[1].toFixed(3));
        vals.bcf_camera_z = parseFloat(cam.eye[2].toFixed(3));
        vals.bcf_target_x = parseFloat(cam.look[0].toFixed(3));
        vals.bcf_target_y = parseFloat(cam.look[1].toFixed(3));
        vals.bcf_target_z = parseFloat(cam.look[2].toFixed(3));
    }
    frappe.new_doc('BIM Issue', vals);
};

// ================================================================
// GIS & FLOOR PLAN PANEL
// ================================================================
function initGISPanel(frm) {
    if (document.getElementById('bim-gis-panel')) return;
    var anchor = document.getElementById('bim-issue-panel') ||
                 document.getElementById('bim-5d-panel') ||
                 document.getElementById('bim-viewer-root');
    if (!anchor) return;

    // Perth CBD coords for demo project
    var siteLat  = -31.9505;
    var siteLng  = 115.8605;
    var siteZoom = 17;

    frappe.call({
        method: 'frappe.client.get',
        args: { doctype: 'BIM Project', name: frm.doc.bim_project,
                fields: ['project_name','address_line1','suburb','state'] },
        callback: function(r) {
            var proj = r.message || {};
            renderGISPanel(frm, proj, siteLat, siteLng, siteZoom);
        }
    });
}

function renderGISPanel(frm, proj, lat, lng, zoom) {
    var anchor = document.getElementById('bim-issue-panel') ||
                 document.getElementById('bim-viewer-root');
    if (!anchor) return;

    // Tile URL uses OSM (no API key needed)
    var tileBase = 'https://tile.openstreetmap.org/';
    // We render the map as an iframe pointing to OSM embed
    var osmUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=' +
        (lng - 0.003) + '%2C' + (lat - 0.002) + '%2C' +
        (lng + 0.003) + '%2C' + (lat + 0.002) +
        '&layer=mapnik&marker=' + lat + '%2C' + lng;

    var address = (proj.address_line1 || '') + (proj.suburb ? ', ' + proj.suburb : '') + (proj.state ? ' ' + proj.state : '');

    var html =
        '<div id="bim-gis-panel" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">' +
        '  <div style="background:#1a3a1a;color:#fff;padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="togglePanel(\'bim-gis-body\')">' +
        '    <span style="font-weight:600;font-size:13px;">&#127757; GIS Site Location &amp; Floor Plans</span>' +
        '    <span id="bim-gis-toggle" style="font-size:16px;">&#9660;</span>' +
        '  </div>' +
        '  <div id="bim-gis-body" style="background:#fff;padding:14px;">' +
        '    <div style="font-size:12px;color:#555;margin-bottom:10px;"><strong>' + (proj.project_name||frm.doc.bim_project) + '</strong> &mdash; ' + address + '</div>' +
        '    <div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '      <div style="flex:2;min-width:260px;">' +
        '        <div style="font-size:11px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Site Location (OpenStreetMap)</div>' +
        '        <iframe src="' + osmUrl + '" style="width:100%;height:320px;border:1px solid #ddd;border-radius:4px;" loading="lazy" title="Site Location"></iframe>' +
        '        <div style="font-size:10px;color:#aaa;margin-top:3px;">Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors</div>' +
        '      </div>' +
        '      <div style="flex:1;min-width:200px;">' +
        '        <div style="font-size:11px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Floor Plans</div>' +
        '        <div id="bim-floorplan-list"><div style="color:#aaa;font-size:12px;font-style:italic;">Loading floor plans…</div></div>' +
        '        <div id="bim-floorplan-viewer" style="margin-top:10px;"></div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    anchor.insertAdjacentHTML('afterend', html);
    loadFloorPlans(frm);
}

function loadFloorPlans(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'BIM Floor Plan',
            filters: { bim_project: frm.doc.bim_project },
            fields: ['name','plan_name','level_name','level_order','svg_file','svg_inline'],
            order_by: 'level_order asc',
            limit: 30
        },
        callback: function(r) {
            var plans = r.message || [];
            var el = document.getElementById('bim-floorplan-list');
            if (!el) return;
            if (!plans.length) {
                el.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No floor plans yet. Create a BIM Floor Plan record to add SVG plans.</div>' +
                    '<button onclick="frappe.new_doc(\'BIM Floor Plan\',{bim_project:\'" + frm.doc.bim_project + "\'})" style="margin-top:8px;font-size:11px;padding:3px 10px;border:1px solid #1976d2;border-radius:3px;color:#1976d2;background:#fff;cursor:pointer;">+ Add Floor Plan</button>';
                return;
            }
            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';
            plans.forEach(function(p) {
                html = html + '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;cursor:pointer;hover:background:#f5f5f5;" onclick="showFloorPlan(\'' + p.name + '\',\'' + (p.svg_file||'') + '\',\'' + encodeURIComponent(p.svg_inline||'') + '\')">' +
                    '<span style="font-size:16px;">&#128250;</span>' +
                    '<div><div style="font-size:12px;font-weight:500;">' + p.level_name + '</div>' +
                    '<div style="font-size:11px;color:#888;">' + p.plan_name + '</div></div>' +
                    '</div>';
            });
            html = html + '</div>';
            el.innerHTML = html;
        }
    });
}

window.showFloorPlan = function(name, svgFile, svgInlineEncoded) {
    var viewer = document.getElementById('bim-floorplan-viewer');
    if (!viewer) return;
    var svgInline = decodeURIComponent(svgInlineEncoded);
    if (svgInline && svgInline.trim().length > 20) {
        viewer.innerHTML = '<div style="border:1px solid #ddd;border-radius:4px;padding:8px;overflow:auto;max-height:300px;">' + svgInline + '</div>';
    } else if (svgFile) {
        viewer.innerHTML = '<img src="' + svgFile + '" style="width:100%;border:1px solid #ddd;border-radius:4px;" alt="Floor Plan"/>';
    } else {
        viewer.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No SVG available for this floor plan.</div>';
    }
};

// ================================================================
// IoT SENSOR PANEL
// ================================================================
var _iotTimer = null;
var _iotData  = [];

function initIoTPanel(frm) {
    if (document.getElementById('bim-iot-panel')) return;
    var anchor = document.getElementById('bim-gis-panel') ||
                 document.getElementById('bim-issue-panel') ||
                 document.getElementById('bim-viewer-root');
    if (!anchor) return;

    var html =
        '<div id="bim-iot-panel" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">' +
        '  <div style="background:#1a2a3a;color:#fff;padding:10px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="togglePanel(\'bim-iot-body\')">' +
        '    <span style="font-weight:600;font-size:13px;">&#128225; IoT Site Monitoring (Teltonika)</span>' +
        '    <div style="display:flex;gap:8px;align-items:center;">' +
        '      <span id="bim-iot-sync-badge" style="font-size:10px;background:rgba(255,255,255,0.15);padding:2px 8px;border-radius:10px;">Idle</span>' +
        '      <button onclick="event.stopPropagation();startIoTSync(cur_frm)" style="font-size:11px;padding:3px 10px;border:1px solid rgba(255,255,255,0.3);border-radius:3px;background:transparent;color:#fff;cursor:pointer;">&#8635; Sync</button>' +
        '      <span id="bim-iot-toggle" style="font-size:16px;">&#9660;</span>' +
        '    </div>' +
        '  </div>' +
        '  <div id="bim-iot-body" style="background:#fff;padding:14px;">' +
        '    <div id="bim-iot-cards" style="display:flex;flex-wrap:wrap;gap:10px;"><div style="color:#aaa;font-size:12px;font-style:italic;">Click Sync to load sensor data.</div></div>' +
        '    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">' +
        '      <button onclick="applyIoTOverlay()" style="font-size:12px;padding:4px 12px;border:1px solid #1a2a3a;border-radius:4px;background:#1a2a3a;color:#fff;cursor:pointer;">Apply Sensor Overlay</button>' +
        '      <button onclick="clearIoTOverlay()" style="font-size:12px;padding:4px 12px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#555;cursor:pointer;">Clear Overlay</button>' +
        '      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#555;">' +
        '        <input type="checkbox" id="bim-iot-auto" onchange="toggleIoTAuto(cur_frm,this.checked)"> Auto-refresh (30s)' +
        '      </label>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    anchor.insertAdjacentHTML('afterend', html);
}

window.startIoTSync = function(frm) {
    var badge = document.getElementById('bim-iot-sync-badge');
    if (badge) { badge.textContent = 'Syncing…'; badge.style.background = 'rgba(33,150,243,0.4)'; }
    frappe.call({
        method: 'bim_iot_sync',
        args: { bim_project: frm.doc.bim_project },
        callback: function(r) {
            var d = r.message || {};
            _iotData = d.sensors || [];
            renderIoTCards();
            var now = new Date().toLocaleTimeString();
            if (badge) { badge.textContent = 'Synced ' + now; badge.style.background = 'rgba(56,142,60,0.4)'; }
        },
        error: function() {
            if (badge) { badge.textContent = 'Error'; badge.style.background = 'rgba(229,57,53,0.4)'; }
        }
    });
};

function renderIoTCards() {
    var el = document.getElementById('bim-iot-cards');
    if (!el) return;
    if (!_iotData.length) {
        el.innerHTML = '<div style="color:#aaa;font-size:12px;font-style:italic;">No active IoT sensor links found for this project. Create BIM IoT Sensor Link records to begin monitoring.</div>';
        return;
    }
    var html = '';
    _iotData.forEach(function(s) {
        var alertBg    = s.in_alert ? '#fff3e0' : '#fff';
        var alertBorder= s.in_alert ? '1px solid #fb8c00' : '1px solid #e0e0e0';
        var statusCol  = s.status === 'Online' ? '#4caf50' : s.status === 'Alert' ? '#fb8c00' : s.status === 'Offline' ? '#e53935' : '#9e9e9e';
        var temp = s.temperature != null ? s.temperature.toFixed(1) + '°C' : '--';
        var hum  = s.humidity    != null ? s.humidity.toFixed(0)    + '%'   : '--';
        var bat  = s.battery     != null ? s.battery.toFixed(2)     + 'V'   : '--';
        html = html +
            '<div style="background:' + alertBg + ';border:' + alertBorder + ';border-radius:8px;padding:10px 12px;min-width:160px;max-width:200px;">' +
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">' +
            '    <span style="font-size:12px;font-weight:600;color:#333;">' + s.link_name + '</span>' +
            '    <span style="width:8px;height:8px;border-radius:50%;background:' + statusCol + ';display:inline-block;"></span>' +
            '  </div>' +
            '  <div style="font-size:10px;color:#888;margin-bottom:6px;">' + (s.element||s.floor_level||'') + '</div>' +
            '  <div style="font-size:11px;color:#555;">' +
            '    <div>&#127777;&#65039; ' + temp + (s.in_alert ? ' <span style="color:#fb8c00;font-weight:600;">&#9888;</span>' : '') + '</div>' +
            '    <div>&#128167; ' + hum + '</div>' +
            '    <div>&#128267; ' + bat + '</div>' +
            '  </div>' +
            '  <div style="font-size:10px;color:#aaa;margin-top:5px;">' + (s.purpose||s.sensor_type||'') + '</div>' +
            '</div>';
    });
    el.innerHTML = html;
}

window.applyIoTOverlay = function() {
    if (!window._bimViewer || !_iotData.length) return;
    var objs = window._bimViewer.scene.objects;
    var hit = 0;
    _iotData.forEach(function(s) {
        if (!s.ifc_guid) return;
        var guid = s.ifc_guid.trim();
        if (!objs[guid]) return;
        // Temperature gradient: blue (cold) -> green (normal) -> red (hot)
        var temp = s.temperature || 20;
        var r, g, b;
        if (temp <= 15) {
            r = 0.2; g = 0.5; b = 0.9;
        } else if (temp <= 25) {
            var t = (temp - 15) / 10;
            r = 0.2 + t * 0.3; g = 0.5 + t * 0.2; b = 0.9 - t * 0.5;
        } else if (temp <= 40) {
            var t2 = (temp - 25) / 15;
            r = 0.5 + t2 * 0.4; g = 0.7 - t2 * 0.5; b = 0.4 - t2 * 0.3;
        } else {
            r = 0.9; g = 0.1; b = 0.1;
        }
        objs[guid].colorize = [r, g, b];
        if (s.in_alert) objs[guid].highlighted = true;
        hit = hit + 1;
    });
    frappe.show_alert({ message: 'IoT overlay applied (' + hit + ' elements coloured by temperature)', indicator: 'blue' }, 4);
};

window.clearIoTOverlay = function() {
    if (!window._bimViewer) return;
    Object.values(window._bimViewer.scene.objects).forEach(function(o) {
        o.colorize = null; o.highlighted = false;
    });
    frappe.show_alert({ message: 'IoT overlay cleared', indicator: 'grey' }, 2);
};

window.toggleIoTAuto = function(frm, on) {
    if (_iotTimer) { clearInterval(_iotTimer); _iotTimer = null; }
    if (on) {
        _iotTimer = setInterval(function() { window.startIoTSync(frm); }, 30000);
        frappe.show_alert({ message: 'Auto-refresh enabled (30s)', indicator: 'green' }, 2);
    }
};

// ================================================================
// SHARED TOGGLE HELPER
// ================================================================
window.togglePanel = function(bodyId) {
    var body = document.getElementById(bodyId);
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
};