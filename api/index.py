"""Vercel serverless entrypoint: expose the Flask app from app.py.

Vercel's Python runtime serves the ``app`` object defined here. The
project root is added to sys.path so the import works regardless of
the working directory the function runs from.

NOTE (2026-11-11): vercel.json's rewrite destination MUST be
``/api/index`` (no ``.py``) -- that is the official Vercel Flask
pattern. With ``/api/index.py`` as the destination, the runtime
handed Flask PATH_INFO=/api/index.py for EVERY request, so all routes
404'd (proven by the runtime logs).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app  # noqa: E402,F401  (Vercel serves this WSGI app)
