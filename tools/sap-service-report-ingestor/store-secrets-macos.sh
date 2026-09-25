#!/bin/zsh
set -euo pipefail

echo "Los valores se guardaran en el Llavero de macOS y no se escribiran en archivos."

read -s "gmail_secret?Pega la contrasena de aplicacion de Gmail: "
echo
gmail_secret="${gmail_secret// /}"
if [[ ${#gmail_secret} -lt 16 ]]; then
  echo "La contrasena de aplicacion de Gmail parece incompleta." >&2
  exit 1
fi
/usr/bin/security add-generic-password -U \
  -a "orionmedinova@gmail.com" \
  -s "orion-sap-imap" \
  -w "$gmail_secret"
unset gmail_secret

read -s "supabase_secret?Pega la llave service_role de Supabase: "
echo
if [[ -z "$supabase_secret" ]]; then
  echo "La llave service_role no puede estar vacia." >&2
  exit 1
fi
/usr/bin/security add-generic-password -U \
  -a "https://mzgrifkunevgestihlmh.supabase.co" \
  -s "orion-sap-supabase-service-role" \
  -w "$supabase_secret"
unset supabase_secret

echo "Listo: ambas credenciales quedaron guardadas en el Llavero."
