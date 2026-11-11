"""Vercel serverless entrypoint: expose the Flask app from app.py.

Vercel's Python runtime serves the ``app`` object defined here. The
project root is added to sys.path so the import works regardless of
the working directory the function runs from.

TEMPORARY DIAGNOSTIC (2026-11-11): the live deployment returns Flask
404 for every path, including /api/health, even though the same app
passes all smoke tests locally. The wrapper below answers
``?debug=1`` on ANY path with a JSON dump of the WSGI environ, so we
can see exactly what PATH_INFO / SCRIPT_NAME Vercel's runtime hands
Flask. REMOVE the debug branch (and this comment) once the routing
cause is found and fixed.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app as flask_app  # noqa: E402,F401  (the real Flask app)


def _wsgi_wrapper(environ, start_response):
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
    return flask_app(environ, start_response)


app = _wsgi_wrapper
