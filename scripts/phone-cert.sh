#!/bin/sh
# HTTPS for testing on your phone over your home Wi-Fi. A phone only treats Tarnished as a real
# app (home-screen install, offline start, notifications, passkeys) over https, and https needs a
# certificate the phone trusts. This makes a small certificate authority of your own and, from it,
# a certificate for this computer's network name (<name>.local) and its current Wi-Fi address.
#
#   sh scripts/phone-cert.sh
#
# The authority is made once; trust it on the phone once (docs/PHONE_TESTING.md). Run the script
# again whenever this computer's address changes: it renews the computer's certificate from the
# same authority, so the phone keeps trusting it. Everything lands in certs/ (gitignored).
#
# The authority can only vouch for this computer's .local name and home-network addresses
# (nameConstraints), so the phone trusting it does not let it stand in for any real website.
# Keep certs/ca.key private all the same, and remove the profile from the phone when you are done.
set -eu

dir="$(cd "$(dirname "$0")/.." && pwd)/certs"
host="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
host="$(printf %s "$host" | tr '[:upper:]' '[:lower:]').local"
ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -n "$ip" ] || { echo "no Wi-Fi address found: is this computer on the network?" >&2; exit 1; }

mkdir -p "$dir"
chmod 700 "$dir"
cd "$dir"

if [ ! -f ca.key ]; then
  cat > ca.cnf <<EOF
[req]
distinguished_name = dn
prompt = no
x509_extensions = ca
[dn]
CN = Tarnished local test CA ($host)
[ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;DNS:$host, permitted;IP:192.168.0.0/255.255.0.0, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0
EOF
  openssl genrsa -out ca.key 2048 2>/dev/null
  chmod 600 ca.key
  openssl req -new -x509 -key ca.key -days 3650 -sha256 -config ca.cnf -out ca.crt
  rm ca.cnf
  echo "Made a new certificate authority: $dir/ca.crt (trust it on the phone once)"
fi

cat > server.cnf <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = $host
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:$host, IP:$ip
authorityKeyIdentifier = keyid
EOF
openssl genrsa -out server.key 2048 2>/dev/null
chmod 600 server.key
openssl req -new -key server.key -config server.cnf -out server.csr
# 397 days: the longest an iPhone accepts for a website's certificate.
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 397 -sha256 \
  -extfile server.cnf -extensions ext -out server.crt 2>/dev/null
rm server.csr server.cnf
printf '%s\n' "$host" > host
printf '%s\n' "$ip" > ip

echo "Certificate for https://$host and https://$ip, valid 397 days: $dir/server.crt"
