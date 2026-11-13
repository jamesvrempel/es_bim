# ES BIM — Building Information Management for ERPNext

A full **3D, 4D and 5D BIM module** for Frappe/ERPNext v15 by [Enterprise Systems Australia](https://enterprisesystems.com.au).

Embeds the [xeokit SDK](https://xeokit.io) into ERPNext forms to deliver IFC model viewing, construction scheduling, cost control, BCF issue tracking, and IoT site monitoring.

---

## Quick Install

```bash
bench get-app es_bim https://github.com/jamesvrempel/es_bim.git
bench --site your-site install-app es_bim
bash apps/es_bim/setup_scripts/install.sh your-site
bench restart
```

Navigate to **ES BIM** in the sidebar or `/app/es-bim`.

---

## Requirements

| Dependency | Version |
|---|---|
| Frappe | v15+ |
| ERPNext | v15+ |
| Python | 3.10+ |
| Node.js | 16+ |

---

## IFC → XKT Conversion

```bash
npm install -g @xeokit/xeokit-convert
sudo ln -s $(which ifc2xkt) /usr/local/bin/ifc2xkt
bench restart
```

Upload an IFC file to a BIM Model record → Status auto-sets to **Processing** → background job converts → Status flips to **Ready** → xeokit 3D viewer loads automatically.

---

## Module Structure

```
es_bim/
├── es_bim/
│   ├── api.py                    # Whitelisted API endpoints
│   ├── hooks.py                  # App config, fixtures, scheduler
│   ├── install.py                # after_install / after_migrate
│   ├── tasks.py                  # Hourly IoT sensor sync
│   └── es_bim/
│       ├── doctype/              # 8 DocTypes
│       ├── fixtures/             # client_script, server_script, role, workspace
│       ├── client_script/        # Source JS (ES5 — no const/let/=>)
│       └── server_script/        # Source Python files
├── setup_scripts/install.sh      # ifc2xkt setup
├── pyproject.toml                # dependencies = [] (REQUIRED — see note)
└── requirements.txt              # empty
```

---

## Known Issues & Fixes Applied in This Version

### ✅ Fix 1: `uv` pip install error (gunicorn URL dependency)
**Symptom:** `Package gunicorn was included as a URL dependency`
**Cause:** `pyproject.toml` listed `frappe>=15.0.0` as a pip dependency
**Fix:** `dependencies = []` — Frappe is managed by bench, not pip

### ✅ Fix 2: `SyntaxError: Unexpected identifier 'frappe'`
**Cause:** Client Scripts used ES6 syntax (`const`, `let`, `=>`, template literals).
Frappe's `ScriptManager` wraps scripts in `new Function()` which rejects ES6
in strict mode on some Frappe v15 builds.
**Fix:** All 8 BIM Client Scripts fully rewritten in ES5:
- `const`/`let` → `var`
- `() =>` → `function()`
- Template literals → string concatenation
- Destructuring → explicit property access

### ✅ Fix 3: `ifc2xkt: command not found` in Frappe workers
**Cause:** npm global bin not in Frappe worker's restricted PATH
**Fix:** `sudo ln -s $(which ifc2xkt) /usr/local/bin/ifc2xkt`

### ✅ Fix 4: Workspace appears blank after install
**Cause:** Frappe's `on_update` hook on Workspace calls `export_to_files` which
fails for database-only modules
**Fix:** `after_migrate` in `install.py` writes workspace content via direct SQL

### ✅ Fix 5: `FileNotFoundError` when registering XKT in Frappe
**Cause:** `frappe.get_doc({'doctype':'File',...}).insert()` tries to read the
XKT file from disk in `before_insert` — fails if file not yet on disk
**Fix:** `bim_run_conversion_job` now uses `frappe.get_doc(...).db_insert()`
to register the File doc without triggering the filesystem read hook

---

## Licence

MIT — Enterprise Systems Australia
