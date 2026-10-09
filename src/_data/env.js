// Umgebungsabhängige Overrides — ohne Env-Var gelten die Werte aus site.json.
//
// Das Kontaktformular holt die Seite zur Laufzeit von cms5 (Mandant
// "gastroekg"). Im Regelfall steht in site.json ein RELATIVER Pfad, damit
// Tracking-Schutz und Werbeblocker nichts zu unterbinden haben; nginx reicht
// /api/ an cms5 weiter. Fehlt der Proxy (Draft, lokaler Dev-Server), greift
// der Rückfall auf die vollständige Adresse aus site.cms5.fallbackBase.
//
// GASTROEKG_FORMS_BASE setzt den Host für die Entwicklung gegen eine lokale
// cms5-Instanz, GASTROEKG_KONTAKT_ENDPOINT überschreibt die Adresse komplett.
const basis = (process.env.GASTROEKG_FORMS_BASE || "").replace(/\/+$/, "");
const formular = (kuerzel) => (basis ? `${basis}/api/gastroekg/forms/${kuerzel}` : "");

module.exports = {
  kontaktEndpoint: process.env.GASTROEKG_KONTAKT_ENDPOINT || formular("kontakt"),
};
