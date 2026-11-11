"""Vercel serverless entrypoint: expose the Flask app from app.py.

Vercel's Python runtime serves the ``app`` object defined here. The
project root is added to sys.path so the import works regardless of
the working directory the function runs from.

IMPORTANT (2026-11-11): ``app`` must stay the Flask instance itself.
An earlier version replaced it with a plain WSGI wrapper function and
Vercel's runtime bypassed that wrapper entirely (Flask handled the
request directly), so middleware has to be installed on
``app.wsgi_app`` instead -- that is the hook Flask actually calls.

TEMPORARY DIAGNOSTIC: the live deployment returns Flask 404 for every
path (the runtime log shows Flask receiving ``GET /api/index.py`` for
requests to /, /api/health, ...). The middleware below answers
``?debug=1`` on ANY path with a JSON dump of the WSGI environ, so we
can see exactly what PATH_INFO / SCRIPT_NAME / headers Vercel's
runtime hands Flask. REMOVE the debug branch (and this comment) once
the routing cause is found and fixed.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app  # noqa: E402,F401  (Vercel serves this Flask app)

_orig_wsgi_app = app.wsgi_app


def _wsgi_middleware(environ, start_response):
    if "debug=1" in environ.get("QUERY_STRING", ""):
        body = json.dumps(
            {k: str(v) for k, v in sorted(environ.items())},
            indent=2,
        ).encode("utf-8")
        start_response("200 OK", [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
        ])
        return [body]
    return _orig_wsgi_app(environ, start_response)


app.wsgi_app = _wsgi_middleware
