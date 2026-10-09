#!/usr/bin/env bash
#
# Deploy der Gastro-Einkaufsgemeinschaft-Website. Zwei Aufrufe:
#
#   ./bin/deploy.sh dev   -> lokal bauen, nichts hochladen
#   ./bin/deploy.sh       -> hochladen nach lara3:/var/www/gastro-ekg-website
#
# Es gibt nur EINE Seite, keine Trennung zwischen Staging und Produktion: Was
# hier ausgerollt wird, ist die Live-Seite. Solange gastro-einkaufsgemeinschaft.de
# noch auf WordPress zeigt, ist sie ueber eine Subdomain erreichbar (nur ein
# Notbehelf bis zur Freigabe) - das Ziel auf dem Server bleibt dasselbe.
# "staging" und "production" werden deshalb als Alias angenommen.
#
# Gebaut wird LOKAL, der Server braucht weder Node noch das Repository: Entweder
# liegt eine vollstaendige Seite vor, oder es passiert gar nichts. Umgeschaltet
# wird per Symlink (ln -sfn ist atomar); die letzten Releases bleiben liegen,
# ein Rueckzug ist ein einzelner Befehl auf dem Server.
#
# Nach dem Muster von optware/bin/deploy.sh, aber ohne cms5-Teile (Formular,
# News-Shell, nginx-Regeln) - die kommen mit dem jeweiligen Modul dazu.
#
set -euo pipefail

ZIEL="${1:-production}"
KEEP="${DEPLOY_KEEP:-5}"

cd "$(dirname "$0")/.."

# ── dev: nur bauen ──────────────────────────────────────────────────────────
# Keine Branch- und Sauberkeitspruefungen: Der dev-Build ist zum Arbeiten da.
if [ "$ZIEL" = "dev" ] || [ "$ZIEL" = "develop" ]; then
  echo "==> _site/ leeren (Eleventy raeumt nicht auf)"
  rm -rf _site
  echo "==> Build (npm run build)"
  npm run build
  if [ ! -f _site/index.html ]; then
    echo "FEHLER: _site ist unvollstaendig." >&2
    exit 1
  fi
  echo "==> Fertig: $(pwd -P)/_site"
  exit 0
fi

SSH_HOST="${DEPLOY_SSH_HOST:-deploy@lara3.aranes.de}"
BASE="${DEPLOY_BASE:-/var/www/gastro-ekg-website}"
DOCROOT="current"
URL="https://gastro-einkaufsgemeinschaft.de/"

case "$ZIEL" in
  production|prod|live|staging|stage) ZIEL="production" ;;
  *)
    echo "FEHLER: Unbekanntes Ziel '$ZIEL'. Erlaubt: dev oder ohne Argument." >&2
    exit 1
    ;;
esac

# ── Absicherung fuer alles, was veroeffentlicht wird ────────────────────────
#   1. Deploy vom Feature-Branch statt von main.
#   2. Eleventy raeumt _site/ nicht auf - nach einem Branchwechsel bleiben die
#      Seiten des alten Branches liegen und wandern mit.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$CURRENT_BRANCH" != "$DEPLOY_BRANCH" ]; then
  echo "FEHLER: Aktueller Branch ist '$CURRENT_BRANCH', deployt wird '$DEPLOY_BRANCH'." >&2
  echo "        Bewusst anderer Branch? Dann: DEPLOY_BRANCH=$CURRENT_BRANCH ./bin/deploy.sh $ZIEL" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "FEHLER: Arbeitsverzeichnis ist nicht sauber - erst committen oder stashen." >&2
  git status --short >&2
  exit 1
fi

# Was veroeffentlicht wird, muss auch auf GitHub liegen.
git fetch -q origin "$DEPLOY_BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$DEPLOY_BRANCH")" ]; then
  echo "FEHLER: HEAD und origin/$DEPLOY_BRANCH sind verschieden - erst pushen." >&2
  echo "        lokal:  $(git rev-parse --short HEAD)" >&2
  echo "        remote: $(git rev-parse --short "origin/$DEPLOY_BRANCH")" >&2
  exit 1
fi

RELEASE="$(date +%Y%m%d%H%M%S)"
REMOTE_RELEASE="$BASE/releases/$RELEASE"

echo "==> Ziel: $ZIEL ($SSH_HOST:$BASE), Stand $(git rev-parse --short HEAD)"

echo "==> _site/ leeren (Eleventy raeumt nicht auf)"
rm -rf _site

echo "==> Build (npm run build)"
npm run build

# Nachkontrolle am Ergebnis, nicht an der Absicht.
for DATEI in index.html impressum/index.html datenschutz/index.html; do
  if [ ! -f "_site/$DATEI" ]; then
    echo "FEHLER: _site/$DATEI fehlt - breche ab, ohne etwas hochzuladen." >&2
    exit 1
  fi
done

echo "==> Upload nach $SSH_HOST:$REMOTE_RELEASE"
ssh "$SSH_HOST" "mkdir -p '$REMOTE_RELEASE'"
rsync -az --delete _site/ "$SSH_HOST:$REMOTE_RELEASE/"

# Umschalten. Ist $DOCROOT noch ein echtes Verzeichnis, wird es einmalig durch
# den Symlink ersetzt; danach ist jeder Wechsel ein atomares ln -sfn.
echo "==> Umschalten: $DOCROOT -> releases/$RELEASE"
ssh "$SSH_HOST" "
  set -e
  cd '$BASE'
  if [ -d '$DOCROOT' ] && [ ! -L '$DOCROOT' ]; then
    echo '    (einmalige Umstellung: $DOCROOT war ein Verzeichnis)'
    mv '$DOCROOT' '$DOCROOT.alt'
    ln -sfn 'releases/$RELEASE' '$DOCROOT'
    rm -rf '$DOCROOT.alt'
  else
    ln -sfn 'releases/$RELEASE' '$DOCROOT'
  fi
"

echo "==> Alte Releases aufraeumen (behalte $KEEP)"
ssh "$SSH_HOST" "cd '$BASE/releases' && ls -1dt */ 2>/dev/null | tail -n +\$(( $KEEP + 1 )) | xargs -r rm -rf"

echo "==> Fertig: Release $RELEASE (Domain: $URL, bis zur Freigabe ueber die Subdomain)"
