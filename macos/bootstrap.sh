#!/bin/bash
set -euo pipefail
umask 077
resources="$1"
state="${ANRUFLISTE_DESKTOP_STATE:-$HOME/Library/Application Support/Anrufliste}"
mkdir -p "$state"
if [ "$(uname -m)" = arm64 ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then runtime_arch=arm64; else runtime_arch=x64; fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
manifest_value() {
 /usr/bin/plutil -extract "$runtime_arch.$1.$2" raw -o - "$resources/runtimes.json"
}
download() {
 local url="$1" checksum="$2" output="$3"
 /usr/bin/curl --fail --location --silent --show-error --retry 2 --connect-timeout 20 --max-time 600 "$url" -o "$output"
 local actual
 actual=$(/usr/bin/shasum -a 256 "$output" | /usr/bin/awk '{print $1}')
 if [ "$actual" != "$checksum" ]; then rm -f "$output"; echo 'Download-Prüfsumme stimmt nicht. Bitte erneut starten.' >&2; exit 1; fi
}
for runtime_name in node python; do
 version=$(manifest_value "$runtime_name" version)
 dest="$state/runtimes/$runtime_arch/$runtime_name-$version"
 if [ "$runtime_name" = node ]; then executable="$dest/bin/node"; else executable="$dest/bin/python3"; fi
 if [ ! -x "$executable" ]; then
  echo "ANRUFLISTE_STATUS=$runtime_name wird beim ersten Start eingerichtet …"
  stage="$state/install-$runtime_name-$$"
  mkdir -p "$stage/unpack"
  download "$(manifest_value "$runtime_name" url)" "$(manifest_value "$runtime_name" sha256)" "$stage/archive.tar.gz"
  /usr/bin/tar -xzf "$stage/archive.tar.gz" -C "$stage/unpack" --strip-components=1
  mkdir -p "$(dirname "$dest")"
  mv "$stage/unpack" "$dest"
  /bin/rm "$stage/archive.tar.gz"
  /bin/rmdir "$stage"
 fi
 if [ "$runtime_name" = node ]; then node_bin="$executable"; else export ANRUFLISTE_PYTHON="$executable"; fi
done
version=$(manifest_value claude version)
export CLAUDE_BIN="$state/runtimes/$runtime_arch/claude-$version"
if [ ! -x "$CLAUDE_BIN" ]; then
 echo 'ANRUFLISTE_STATUS=Claude Code wird eingerichtet …'
 download "$(manifest_value claude url)" "$(manifest_value claude sha256)" "$CLAUDE_BIN.download"
 chmod 700 "$CLAUDE_BIN.download"
 mv "$CLAUDE_BIN.download" "$CLAUDE_BIN"
fi
export ANRUFLISTE_STATE_DIR="$state/config"
export ANRUFLISTE_VENV="$state/excel-venv"
export CLAUDE_CONFIG_DIR="$state/claude"
mkdir -p "$CLAUDE_CONFIG_DIR"
unset ANTHROPIC_BASE_URL ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CODE_OAUTH_REFRESH_TOKEN CLAUDE_CODE_OAUTH_SCOPES CLAUDECODE CLAUDE_CODE_ENTRYPOINT || true
export PATH="$(dirname "$node_bin"):$(dirname "$ANRUFLISTE_PYTHON"):$PATH"
echo 'ANRUFLISTE_STATUS=Excel-Baukasten wird geprüft …'
"$ANRUFLISTE_PYTHON" "$resources/app/skill/build.py" check - >&2
echo 'ANRUFLISTE_STATUS=Anrufliste startet …'
cd "$state"
exec "$node_bin" "$resources/app/bin/anrufliste.js" --desktop --no-open
