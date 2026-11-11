"""Turso (remote libsql) database adapter for the Tipitaka Flask app.

The app was written against sqlite3. libsql 0.1.x speaks the same SQL
but exposes a different Python surface: no ``row_factory``, rows come
back as plain tuples, and errors surface as ``ValueError`` (or
``libsql.Error``) instead of ``sqlite3`` exception classes.

This module bridges that gap so the Turso-backed path needs no
endpoint or SQL changes:

* :class:`TursoRow` mimics ``sqlite3.Row`` (``row['col']``, ``row[0]``,
  ``row.keys()``, ``dict(row)``, ``len(row)``, iteration).
* :class:`TursoConnection` / ``_TursoCursor`` present the sqlite3
  Connection/Cursor surface the app actually uses (``execute``,
  ``executemany``, ``executescript``, ``commit``, ``close``, ``cursor``,
  ``fetchone``/``fetchall``/``fetchmany``, ``lastrowid``) and translate
  libsql errors back to the matching ``sqlite3`` exception classes, so
  existing ``except sqlite3.IntegrityError`` handlers keep working.
* :func:`connect_turso` / :func:`turso_enabled` are the only entry
  points app.py needs.

Local behaviour is untouched: this module is only used when the
matching ``TURSO_*_URL`` env var is set. PRAGMAs are never issued on
Turso connections (Hrana does not support the local-only pragmas the
same way); app.py keeps them in the sqlite3 branch only.
"""

import os
import sqlite3

try:
    import libsql
except ImportError:  # pragma: no cover - local/VPS installs without libsql
    libsql = None

_URL_ENV = {
    "pali": "TURSO_PALI_URL",
    "mm": "TURSO_MM_URL",
    "nissaya": "TURSO_NISSAYA_URL",
    "sync": "TURSO_SYNC_URL",
}

_TOKEN_ENV = {
    "pali": "TURSO_PALI_TOKEN",
    "mm": "TURSO_MM_TOKEN",
    "nissaya": "TURSO_NISSAYA_TOKEN",
    "sync": "TURSO_SYNC_TOKEN",
}

# libsql 0.1.x raises ValueError (and sometimes libsql.Error) carrying the
# SQLite engine message, e.g. "UNIQUE constraint failed: sync_accounts.code".
_INTEGRITY_MARKERS = (
    "UNIQUE constraint failed",
    "NOT NULL constraint failed",
    "FOREIGN KEY constraint failed",
    "CHECK constraint failed",
    "PRIMARY KEY constraint failed",
)

_OPERATIONAL_MARKERS = (
    "no such table",
    "no such column",
    "no such function",
    "syntax error",
    "incomplete input",
    "database is locked",
    "database table is locked",
    "readonly database",
    "attempt to write a readonly database",
)


def _translate_error(exc):
    """Re-raise a libsql error as the matching sqlite3 exception.

    Unknown ValueErrors (e.g. from our own code, not the engine) are
    passed through untouched.
    """
    msg = str(exc)
    if any(marker in msg for marker in _INTEGRITY_MARKERS):
        raise sqlite3.IntegrityError(msg) from exc
    if any(marker in msg for marker in _OPERATIONAL_MARKERS):
        raise sqlite3.OperationalError(msg) from exc
    if libsql is not None and isinstance(exc, libsql.Error):
        raise sqlite3.DatabaseError(msg) from exc
    raise exc


def turso_enabled(kind):
    """True when the matching TURSO_*_URL env var is set for ``kind``.

    ``kind`` is one of 'pali', 'mm', 'nissaya', 'sync'.
    """
    return bool(os.environ.get(_URL_ENV[kind]))


def connect_turso(kind):
    """Open a Turso (remote libsql) connection for ``kind``.

    Reads ``TURSO_<KIND>_URL`` and ``TURSO_<KIND>_TOKEN`` from the
    environment. ``libsql.connect`` also accepts a ``file:...`` URL,
    which is how the adapter is tested locally without a real Turso
    database (no token needed for local files).
    """
    if libsql is None:
        raise RuntimeError(
            "libsql is not installed, but %s is set; "
            "install libsql or unset it to use local sqlite3"
            % _URL_ENV[kind]
        )
    url = os.environ.get(_URL_ENV[kind], "")
    token = os.environ.get(_TOKEN_ENV[kind], "") or ""
    raw = libsql.connect(
        database=url, auth_token=token, timeout=10.0, _check_same_thread=False
    )
    return TursoConnection(raw)


class TursoRow:
    """sqlite3.Row-compatible row.

    Built from a cursor description (column names) and a plain tuple
    of values, as returned by libsql. Name lookup is case-insensitive,
    matching sqlite3.Row.
    """

    __slots__ = ("_keys", "_values", "_index")

    def __init__(self, keys, values):
        self._keys = tuple(keys)
        self._values = tuple(values)
        self._index = {k.lower(): i for i, k in enumerate(self._keys)}

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                return self._values[self._index[key.lower()]]
            except KeyError:
                raise IndexError("No item with that key") from None
        return self._values[key]

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def keys(self):
        return list(self._keys)

    def __eq__(self, other):
        if isinstance(other, TursoRow):
            return self._keys == other._keys and self._values == other._values
        return NotImplemented

    def __repr__(self):
        pairs = ", ".join(
            "%s=%r" % (k, v) for k, v in zip(self._keys, self._values)
        )
        return "TursoRow(%s)" % pairs


class _TursoCursor:
    """Cursor wrapper: libsql cursor in, TursoRow results out."""

    def __init__(self, cursor):
        self._cur = cursor

    @property
    def description(self):
        return self._cur.description

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def arraysize(self):
        return self._cur.arraysize

    @arraysize.setter
    def arraysize(self, value):
        self._cur.arraysize = value

    def _wrap(self, rows):
        desc = self._cur.description
        if not desc:
            return [tuple(r) for r in rows]
        keys = [d[0] for d in desc]
        return [TursoRow(keys, r) for r in rows]

    def execute(self, sql, params=()):
        try:
            self._cur.execute(sql, params)
        except (libsql.Error, ValueError) as e:
            _translate_error(e)
        return self

    def executemany(self, sql, seq):
        try:
            self._cur.executemany(sql, seq)
        except (libsql.Error, ValueError) as e:
            _translate_error(e)
        return self

    def executescript(self, sql):
        try:
            self._cur.executescript(sql)
        except (libsql.Error, ValueError) as e:
            _translate_error(e)
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return self._wrap([row])[0]

    def fetchall(self):
        return self._wrap(self._cur.fetchall())

    def fetchmany(self, size=None):
        if size is None:
            rows = self._cur.fetchmany()
        else:
            rows = self._cur.fetchmany(size)
        return self._wrap(rows)

    def __iter__(self):
        # sqlite3 cursors are iterable (app.py iterates one directly:
        # `for (pg,) in m_cur.execute(...)`). Stream rows via fetchone,
        # matching sqlite3's lazy iteration.
        return self

    def __next__(self):
        row = self.fetchone()
        if row is None:
            raise StopIteration
        return row

    def close(self):
        self._cur.close()


class TursoConnection:
    """Connection wrapper: libsql connection in, sqlite3 surface out."""

    def __init__(self, raw_conn):
        self._conn = raw_conn

    def execute(self, sql, params=()):
        cur = _TursoCursor(self._conn.cursor())
        return cur.execute(sql, params)

    def executemany(self, sql, seq):
        cur = _TursoCursor(self._conn.cursor())
        return cur.executemany(sql, seq)

    def executescript(self, sql):
        try:
            self._conn.executescript(sql)
        except (libsql.Error, ValueError) as e:
            _translate_error(e)
        return self.cursor()

    def commit(self):
        try:
            self._conn.commit()
        except (libsql.Error, ValueError) as e:
            _translate_error(e)

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def cursor(self):
        return _TursoCursor(self._conn.cursor())

    @property
    def in_transaction(self):
        return self._conn.in_transaction

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False
