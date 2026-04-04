#!/usr/bin/env bash
# ES BIM — Server Setup Script
# Run once after: bench install-app es_bim
set -e

SITE="${1:-demo2.enterprisesystems.com.au}"
echo "=== ES BIM Server Setup (site: $SITE) ==="

# 1. Install ifc2xkt for IFC→XKT conversion
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found. Install: sudo apt install nodejs npm"
    exit 1
fi

echo "Installing @xeokit/xeokit-convert..."
npm install -g @xeokit/xeokit-convert

# 2. Symlink ifc2xkt to /usr/local/bin so Frappe workers find it
# (Workers use restricted PATH — /usr/local/bin is always included)
IFC2XKT_PATH=$(which ifc2xkt 2>/dev/null || true)
if [ -n "$IFC2XKT_PATH" ]; then
    if [ ! -f /usr/local/bin/ifc2xkt ]; then
        echo "Symlinking ifc2xkt -> /usr/local/bin/ifc2xkt"
        sudo ln -s "$IFC2XKT_PATH" /usr/local/bin/ifc2xkt
    fi
    echo "ifc2xkt ready at /usr/local/bin/ifc2xkt"
else
    echo "WARNING: ifc2xkt not found in PATH after install."
    echo "  Fix: sudo ln -s \$(npm bin -g)/ifc2xkt /usr/local/bin/ifc2xkt"
fi

# 3. Allow IFC/XKT file uploads in Frappe System Settings
echo "Adding IFC/XKT/P21 to allowed file extensions..."

# 4. Confirm
echo ""
echo "=== ES BIM setup complete. Run: bench restart ==="
echo ""
echo "After restart, set BIM Model status to 'Processing' and save"
echo "to trigger automatic IFC → XKT conversion."
