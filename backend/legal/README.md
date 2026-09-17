# Official legal documents — supplied by the business, never written here

The backend serves `GET /legal/terms` and `GET /legal/privacy` from this
directory (or `BACKEND_LEGAL_DIR`) only when the business has placed its
official, approved documents here:

    terms.ar.html   terms.en.html   privacy.ar.html   privacy.en.html   meta.json

`meta.json`:

    { "terms":   { "version": "1.0", "effectiveAt": "YYYY-MM-DD", "titleAr": "…", "titleEn": "…" },
      "privacy": { "version": "1.0", "effectiveAt": "YYYY-MM-DD", "titleAr": "…", "titleEn": "…" } }

Until then the endpoints answer 404 and the website shows its "not published"
state. No legal wording is invented, drafted or altered by this project.
