// Client Script: BIM Model - Xeokit Viewer
// DocType: BIM Model
// ES5 compatible — no const/let/=>/template literals

// ES BIM Module — BIM Model Client Script (ES5 compatible)
// Initialises the xeokit 3D viewer when the XKT file is available,
// polls for conversion completion, and wires up the element info panel.

frappe.ui.form.on('BIM Model', {

    refresh: function(frm) {
        // Status badge
        frm.dashboard.clear_comment();
        var statusColors = {
            'Draft':      'yellow',
            'Processing': 'blue',
            'Ready':      'green',
            'Error':      'red',
            'Archived':   'grey'
        };
        var color = statusColors[frm.doc.status] || 'grey';
        frm.dashboard.add_comment(
            '<span class="indicator ' + color + '">Model status: <b>' + frm.doc.status + '</b></span>',
            color,
            true
        );

        // Viewer init
        if (frm.doc.xkt_file && frm.doc.status === 'Ready') {
            setTimeout(function() { initXeokitViewer(frm); }, 400);
        } else if (frm.doc.status === 'Processing') {
            setViewerStatus('⏳ Converting IFC → XKT… Polling for completion.');
            startPolling(frm);
        } else if (frm.doc.ifc_file && !frm.doc.xkt_file) {
            setViewerStatus('IFC uploaded. Save to trigger conversion.');
        } else if (!frm.doc.ifc_file) {
            setViewerStatus('Upload an IFC file above to begin.');
        }

        // Custom buttons
        if (frm.doc.ifc_file && frm.doc.status !== 'Processing') {
            frm.add_custom_button(__('Re-convert IFC → XKT'), function() {
                frappe.confirm(
                    'Re-run the IFC to XKT conversion? The existing XKT will be replaced.',
                    function() { triggerConversion(frm); }
                );
            }, __('BIM Actions'));
        }

        if (frm.doc.bim_project) {
            frm.add_custom_button(__('Open BIM Project'), function() {
                frappe.set_route('Form', 'BIM Project', frm.doc.bim_project);
            });
        }
    },

    ifc_file: function(frm) {
        if (frm.doc.ifc_file && frm.doc.status === 'Draft') {
            frm.set_value('status', 'Processing');
            frm.save().then(function() { triggerConversion(frm); });
        }
    }

});

// Trigger IFC → XKT conversion
function triggerConversion(frm) {
    frm.set_value('status', 'Processing');
    frm.set_value('conversion_log', 'Conversion queued...');
    frm.save().then(function() {
        frappe.call({
            method: 'frappe.client.set_value',
            args: { doctype: 'BIM Model', name: frm.doc.name, fieldname: 'status', value: 'Processing' }
        });
        frappe.call({
            method: 'bim_model_convert_ifc',
            args: { docname: frm.doc.name },
            callback: function(r) {
                if (r.exc) {
                    frappe.msgprint({ title: 'Conversion Error', indicator: 'red', message: r.exc });
                } else {
                    frappe.show_alert({ message: 'Conversion job queued', indicator: 'blue' }, 4);
                    startPolling(frm);
                }
            }
        });
    });
}

// Poll every 5s for completion
var _pollTimer = null;

function startPolling(frm) {
    clearPolling();
    setViewerStatus('⏳ Converting IFC → XKT… checking every 5s');
    _pollTimer = setInterval(function() {
        frappe.db.get_value('BIM Model', frm.doc.name, ['status', 'xkt_file', 'conversion_log'])
            .then(function(r) {
                var d = r.message;
                if (d.status === 'Ready' && d.xkt_file) {
                    clearPolling();
                    frm.reload_doc();
                    frappe.show_alert({ message: '✅ XKT ready — loading viewer', indicator: 'green' }, 4);
                } else if (d.status === 'Error') {
                    clearPolling();
                    setViewerStatus('❌ Conversion failed. Check Conversion Log.');
                    frm.reload_doc();
                }
            });
    }, 5000);
    setTimeout(clearPolling, 600000);
}

function clearPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function setViewerStatus(msg) {
    var el = document.getElementById('bim-status-text');
    if (el) el.innerHTML = msg;
}

// Viewer globals
window._bimViewer = null;
window._bimXrayOn = false;
window._bimSectionOn = false;
window._bimSectionPlugin = null;

function initXeokitViewer(frm) {
    if (typeof xeokit === 'undefined' && typeof XKTLoaderPlugin === 'undefined') {
        loadXeokitSDK(function() { _startViewer(frm); });
    } else {
        _startViewer(frm);
    }
}

function loadXeokitSDK(callback) {
    setViewerStatus('Loading xeokit SDK...');
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@xeokit/xeokit-sdk/dist/xeokit-sdk.min.es.js';
    s.type = 'module';
    s.onload = callback;
    s.onerror = function() { setViewerStatus('❌ Failed to load xeokit SDK from CDN.'); };
    document.head.appendChild(s);
}

function _startViewer(frm) {
    setViewerStatus('');
    var canvas = document.getElementById('bim-canvas');
    if (!canvas) return;

    try {
        var Viewer = xeokit.Viewer;
        var XKTLoaderPlugin = xeokit.XKTLoaderPlugin;
        var SectionPlanesPlugin = xeokit.SectionPlanesPlugin;

        var viewer = new Viewer({ canvasId: 'bim-canvas', transparent: false, dtxEnabled: true });
        window._bimViewer = viewer;

        viewer.scene.camera.eye  = [10, 10, 10];
        viewer.scene.camera.look = [0,  0,  0];
        viewer.scene.camera.up   = [0,  1,  0];

        var loader = new XKTLoaderPlugin(viewer);
        window._bimSectionPlugin = new SectionPlanesPlugin(viewer, { overviewCanvasId: null });

        setViewerStatus('Loading model...');

        var model = loader.load({ id: 'bim-model-' + frm.doc.name, src: frm.doc.xkt_file, edges: true });

        model.on('loaded', function() {
            setViewerStatus('');
            viewer.cameraFlight.flyTo(model);
            frappe.show_alert({ message: '3D model loaded ✅', indicator: 'green' }, 3);
        });

        model.on('error', function(e) {
            setViewerStatus('❌ Error loading XKT: ' + e);
        });

        viewer.scene.input.on('mouseclicked', function(coords) {
            var hit = viewer.scene.pick({ canvasPos: coords });
            if (hit && hit.entity) {
                showElementInfo(hit.entity.id, viewer.metaScene.metaObjects[hit.entity.id]);
            } else {
                hideElementInfo();
            }
        });

    } catch(err) {
        setViewerStatus('❌ Viewer error: ' + err.message);
        console.error('[ES BIM] xeokit init error:', err);
    }
}

function showElementInfo(id, metaObj) {
    var panel = document.getElementById('bim-element-info');
    var nameEl = document.getElementById('bim-el-name');
    var detailEl = document.getElementById('bim-el-details');
    if (!panel) return;
    nameEl.textContent = (metaObj && metaObj.name) ? metaObj.name : 'Element ' + id;
    var html = '<div><b>IFC Type:</b> ' + ((metaObj && metaObj.type) ? metaObj.type : 'Unknown') + '</div>';
    html = html + '<div><b>ID:</b> ' + id + '</div>';
    if (metaObj && metaObj.propertySets) {
        html = html + '<hr style="border-color:rgba(255,255,255,0.15);margin:6px 0">';
        metaObj.propertySets.forEach(function(ps) {
            if (ps.properties) {
                ps.properties.forEach(function(p) {
                    html = html + '<div><b>' + p.name + ':</b> ' + p.value + '</div>';
                });
            }
        });
    }
    detailEl.innerHTML = html;
    panel.style.display = 'block';
}

function hideElementInfo() {
    var panel = document.getElementById('bim-element-info');
    if (panel) panel.style.display = 'none';
}

// Toolbar handlers
window.bimFitAll = function() {
    if (window._bimViewer) window._bimViewer.cameraFlight.flyTo(window._bimViewer.scene);
};
window.bimToggleXray = function() {
    if (!window._bimViewer) return;
    window._bimXrayOn = !window._bimXrayOn;
    window._bimViewer.scene.xrayMaterial.fillAlpha = window._bimXrayOn ? 0.1 : 0;
    window._bimViewer.scene.xrayMaterial.edgeAlpha = window._bimXrayOn ? 0.3 : 0;
    Object.values(window._bimViewer.scene.objects).forEach(function(o) {
        o.xrayed = window._bimXrayOn;
    });
};
window.bimToggleSection = function() {
    if (!window._bimViewer || !window._bimSectionPlugin) return;
    window._bimSectionOn = !window._bimSectionOn;
    if (window._bimSectionOn) {
        window._bimSectionPlugin.createSectionPlane({ id: 'sectionPlane1', pos: [0, 2, 0], dir: [0, -1, 0] });
    } else {
        window._bimSectionPlugin.destroySectionPlane('sectionPlane1');
    }
};
window.bimResetView = function() {
    if (!window._bimViewer) return;
    window._bimXrayOn = false;
    window._bimViewer.cameraFlight.flyTo(window._bimViewer.scene);
    Object.values(window._bimViewer.scene.objects).forEach(function(o) {
        o.xrayed = false; o.highlighted = false; o.visible = true;
    });
    hideElementInfo();
};