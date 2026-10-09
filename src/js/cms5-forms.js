/*
 * Holt Formulare aus cms5 und verdrahtet sie.
 *
 * Einbindung:
 *
 *   <div data-cms5-form-src="/api/gastroekg/forms/kontakt"
 *        data-cms5-form-fallback="https://aracms5.aranes.de/api/gastroekg/forms/kontakt"
 *        data-cms5-success-class="form-success"></div>
 *   <script src="/js/cms5-forms.js" defer></script>
 *
 * Der Regelweg ist der RELATIVE Pfad: Fuer den Browser bleibt dann alles auf
 * einer Domain, und kein Tracking-Schutz kann sich einmischen. Er setzt
 * voraus, dass nginx /api/ an cms5 weiterreicht.
 *
 * data-cms5-form-fallback ist fuer Server, wo das nicht eingerichtet ist -
 * derzeit der Draft-Server. Kommt ueber den relativen Pfad kein Formular,
 * wird einmal die vollstaendige Adresse versucht. Auf der Live-Domain
 * passiert das nie, dort greift schon der erste Versuch.
 *
 * Das Markup, die Felder und der Spam-Schutz stehen in cms5. Diese Datei
 * kümmert sich nur um das, was im Browser passieren muss: einsetzen, Cloudflare
 * nachladen, absenden, Antwort anzeigen.
 *
 * Auch der Weg nach dem Absenden kommt von dort: Traegt der Umschlag ein
 * success_url, springt die Seite dorthin; sonst ersetzt eine Dankmeldung das
 * Formular an Ort und Stelle. Beides wird im Backend am Formular entschieden,
 * hier ist nichts einzutragen.
 *
 * Kein document.write(): Der Abruf ist asynchron, seine Antwort trifft also
 * immer nach dem Parsen ein - und document.write() zu diesem Zeitpunkt öffnet
 * ein neues Dokument und löscht damit die ganze Seite.
 */
(function () {
    'use strict';

    var PLATZHALTER = '[data-cms5-form-src]';
    var WURZEL = 'cms5-form';
    var TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

    function start() {
        var slots = document.querySelectorAll(PLATZHALTER);

        for (var i = 0; i < slots.length; i++) {
            hole(slots[i]);
        }
    }

    function hole(slot) {
        var quellen = [
            slot.getAttribute('data-cms5-form-src'),
            slot.getAttribute('data-cms5-form-fallback')
        ].filter(function (q, i, alle) {
            return q && alle.indexOf(q) === i;
        });

        if (quellen.length === 0) {
            return;
        }

        versuche(slot, quellen, 0);
    }

    function versuche(slot, quellen, i) {
        fetch(quellen[i], {
            headers: { Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit'
        })
            .then(function (res) { return res.json(); })
            .then(function (daten) {
                if (!daten || daten.result !== true || !daten.form || !daten.form.markup) {
                    throw new Error((daten && daten.msg) || 'Antwort ohne Formular.');
                }

                einsetzen(slot, daten.form);
            })
            .catch(function (fehler) {
                // Der naechste Kandidat ist die vollstaendige Adresse - fuer
                // Server, die /api/ nicht an cms5 weiterreichen.
                if (i + 1 < quellen.length) {
                    console.warn('[cms5] ' + quellen[i] + ' lieferte kein Formular, versuche ' + quellen[i + 1]);
                    versuche(slot, quellen, i + 1);
                    return;
                }

                // Kein Alarm auf der Seite: Fehlt das Formular, bleibt die Stelle
                // leer und der Grund steht in der Konsole. Die Kontaktdaten
                // stehen ohnehin darüber.
                slot.setAttribute('data-cms5-state', 'error');
                console.error('[cms5] Formular konnte nicht geladen werden:', fehler);
            });
    }

    function einsetzen(slot, formular) {
        slot.insertAdjacentHTML('beforeend', formular.markup);
        slot.setAttribute('data-cms5-state', 'ready');

        var form = slot.querySelector('form.' + WURZEL);

        if (!form) {
            return;
        }

        // Wann wurde das Formular sichtbar? Der Server verlangt eine
        // Mindestdauer zwischen Anzeigen und Absenden - Bots füllen sofort aus.
        var zustand = {
            slot: slot,
            gezeigtAb: Date.now(),
            turnstile: formular.turnstile || { required: false },
            // Wohin nach dem Absenden. Steht im Backend am Formular, nicht
            // hier - sonst muesste der Ablauf an zwei Stellen gepflegt werden.
            // Leer heisst: Dankmeldung an Ort und Stelle wie bisher.
            weiterZu: formular.success_url || null
        };

        form.addEventListener('submit', function (e) { absenden(e, zustand); });

        if (zustand.turnstile.required) {
            turnstileNachladen(form);
        }
    }

    /*
     * Cloudflare erst laden, wenn jemand das Formular anfasst - wer nur
     * vorbeiscrollt, baut keine Verbindung dorthin auf. Dass es nötig ist, sagt
     * der Umschlag der Antwort; den Schlüssel kennt diese Datei nicht, er steht
     * im gelieferten Markup.
     */
    function turnstileNachladen(form) {
        var angefordert = false;

        function laden() {
            if (angefordert) {
                return;
            }

            angefordert = true;

            var s = document.createElement('script');
            s.src = TURNSTILE_URL;
            s.async = true;
            s.defer = true;
            document.head.appendChild(s);
        }

        ['focusin', 'pointerdown'].forEach(function (evt) {
            form.addEventListener(evt, laden, { once: true });
        });
    }

    function absenden(e, zustand) {
        e.preventDefault();

        var form = e.currentTarget;

        melden(form, '');
        fehlerLoeschen(form);

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Ohne gelöstes Token lehnt der Server ohnehin ab - den Hinweis geben
        // wir lieber hier als nach dem Roundtrip.
        if (zustand.turnstile.required && !tokenDa(form)) {
            melden(form, 'Bitte bestätigen Sie kurz die Sicherheitsabfrage und senden Sie erneut.', true);
            return;
        }

        var daten = new FormData(form);
        daten.set('elapsed', String(Date.now() - zustand.gezeigtAb));

        var knopf = form.querySelector('button[type="submit"]');
        var aufschrift = knopf ? knopf.innerHTML : '';

        if (knopf) {
            knopf.disabled = true;
            knopf.innerHTML = 'Wird gesendet…';
        }

        fetch(form.getAttribute('action'), {
            method: 'POST',
            body: daten,
            mode: 'cors',
            credentials: 'omit',
            headers: { Accept: 'application/json' }
        })
            .then(function (res) {
                return res.json().catch(function () { return {}; });
            })
            .then(function (antwort) {
                if (antwort && antwort.result === true) {
                    if (zustand.weiterZu) {
                        // replace() statt href: Der Zurueck-Knopf soll nicht auf
                        // das abgesendete Formular zeigen, sonst landet der
                        // Besucher bei einem Formular, das er schon abgeschickt
                        // hat - und schickt es womoeglich ein zweites Mal.
                        window.location.replace(zustand.weiterZu);
                        return;
                    }

                    erfolg(zustand.slot, form, antwort.msg);
                    return;
                }

                melden(form, (antwort && antwort.msg) || 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.', true);

                if (antwort && antwort.field) {
                    fehlerZeigen(form, antwort.field);
                }

                zuruecksetzen(knopf, aufschrift);
            })
            .catch(function () {
                melden(form, 'Verbindungsfehler. Bitte versuchen Sie es erneut oder rufen Sie uns an.', true);
                zuruecksetzen(knopf, aufschrift);
            });
    }

    function tokenDa(form) {
        var feld = form.querySelector('[name="cf-turnstile-response"]');

        return Boolean(feld && feld.value);
    }

    function zuruecksetzen(knopf, aufschrift) {
        if (knopf) {
            knopf.disabled = false;
            knopf.innerHTML = aufschrift;
        }

        // Ein Token gilt nur einmal - nach einer Ablehnung braucht es ein neues.
        if (window.turnstile) {
            try { window.turnstile.reset(); } catch (fehler) { /* egal */ }
        }
    }

    function erfolg(slot, form, text) {
        var meldung = document.createElement('p');

        meldung.className = slot.getAttribute('data-cms5-success-class') || (WURZEL + '__success');
        meldung.textContent = text || 'Vielen Dank für Ihre Anfrage! Wir melden uns zeitnah bei Ihnen.';

        form.parentNode.replaceChild(meldung, form);
    }

    function melden(form, text, istFehler) {
        var el = form.querySelector('.' + WURZEL + '__message');

        if (!el) {
            return;
        }

        el.textContent = text || '';

        if (istFehler) {
            el.setAttribute('data-state', 'error');
        } else {
            el.removeAttribute('data-state');
        }
    }

    function fehlerZeigen(form, name) {
        var feld = form.querySelector('[data-field="' + name + '"]');

        if (!feld) {
            return;
        }

        feld.setAttribute('data-state', 'error');

        var eingabe = feld.querySelector('input, textarea, select');

        if (eingabe) {
            eingabe.focus();
        }
    }

    function fehlerLoeschen(form) {
        var markiert = form.querySelectorAll('[data-field][data-state]');

        for (var i = 0; i < markiert.length; i++) {
            markiert[i].removeAttribute('data-state');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
