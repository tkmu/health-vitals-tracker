#!/usr/bin/env bash
# Opens Google Cloud Console for OAuth + Web client (Google Auth Platform UI).
#
# Usage: GCP_PROJECT_ID=my-project ./scripts/oauth-gcp-console-urls.sh

set -euo pipefail
PROJECT="${GCP_PROJECT_ID:-vitals-health-2195885d}"

BASE="https://console.cloud.google.com"
# New UI: Google Auth Platform (recommended)
AUTH_OVERVIEW="${BASE}/auth/overview?project=${PROJECT}"
AUTH_CLIENTS="${BASE}/auth/clients?project=${PROJECT}"
# Legacy Credentials (still works if redirects differ)
LEGACY_CONSENT="${BASE}/apis/credentials/consent?project=${PROJECT}"
LEGACY_OAUTH_CREATE="${BASE}/apis/credentials/oauthclient?project=${PROJECT}"

echo "Project: ${PROJECT}"
echo ""
echo "If you see «Google Auth Platform not configured yet»: click GET STARTED, then use the wizard."
echo "(You can revisit anytime from the Auth Platform Overview.)"
echo ""
echo "1) Auth Platform Overview"
echo "   ${AUTH_OVERVIEW}"
echo ""
echo "2) Clients → Create client → Web → add redirect:"
echo "   ${AUTH_CLIENTS}"
echo ""
echo "   Authorized JavaScript origins (optional): http://localhost:3000"
echo "   Authorized redirect URIs (required):"
echo "   - http://localhost:3000/api/auth/callback/google"
echo ""
echo "Legacy (APIs & Services → Credentials) if you prefer:"
echo "   ${LEGACY_CONSENT}"
echo "   ${LEGACY_OAUTH_CREATE}"
echo ""
echo "3) Copy into local .env (never commit):"
echo "   AUTH_GOOGLE_ID=<Client ID>"
echo "   AUTH_GOOGLE_SECRET=<Client secret>"
echo "   AUTH_SECRET=<openssl rand -base64 32>"
echo ""

if [[ "$(uname)" == "Darwin" ]]; then
  open "${AUTH_OVERVIEW}" 2>/dev/null || true
  sleep 1
  open "${AUTH_CLIENTS}" 2>/dev/null || true
fi
