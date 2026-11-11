import os
import io
import sys
import sqlite3
# Turso (remote libsql) adapter. Import is safe without libsql installed:
# db_turso only raises when a TURSO_*_URL is set but libsql is missing.
# With no TURSO_* vars set the app behaves exactly as before (local sqlite3).
from db_turso import connect_turso, turso_enabled
import re
import webbrowser
import threading
import secrets
import hashlib
import time
import json
from functools import lru_cache
from flask import Flask, Response, jsonify, render_template, request, g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Android wrapper sets TIPITAKA_DATA_DIR to the app's private storage where the
# downloaded databases live. Web/VPS deployments leave it unset -> BASE_DIR.
DATA_DIR = os.environ.get("TIPITAKA_DATA_DIR", BASE_DIR)
DB_PALI_PATH = os.path.join(DATA_DIR, "tipitaka_pali.db")
DB_MM_PATH = os.path.join(DATA_DIR, "tipitaka_mm.db")
DB_NISSAYA_PATH = os.path.join(DATA_DIR, "nissaya.db")
DB_PALI_RO_URI = f"file:{os.path.abspath(DB_PALI_PATH).replace(os.sep, '/')}?mode=ro"
DB_MM_RO_URI = f"file:{os.path.abspath(DB_MM_PATH).replace(os.sep, '/')}?mode=ro"
DB_NISSAYA_RO_URI = f"file:{os.path.abspath(DB_NISSAYA_PATH).replace(os.sep, '/')}?mode=ro"
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# ---------------------------------------------------------------------------
# App identity: shown in the User Guide (credits section) on web + Android.
# Synchronized with Android versionName or android_release.json.
# APP_CREATED_DATE is the day this app was first created and never changes.
# ---------------------------------------------------------------------------
def _env_int(name, default):
    """Parse an integer env var; fall back on garbage input instead of 500ing."""
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _resolve_app_version():
    # 1. Injected by Android bootstrap/runtime (matches installed APK versionName)
    env_ver = os.environ.get("ANDROID_VERSION_NAME")
    if env_ver:
        return env_ver.strip()
    # 2. VPS / Web release metadata
    try:
        rel_file = os.path.join(BASE_DIR, "android_release.json")
        if os.path.isfile(rel_file):
            with open(rel_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                v = data.get("versionName")
                if v:
                    return str(v).strip()
    except Exception:
        pass
    # 3. Fallback
    return "1.0.2"

APP_VERSION = _resolve_app_version()
APP_CREATED_DATE = "2026-09-24"

app = Flask(__name__, static_folder=STATIC_DIR, template_folder=TEMPLATES_DIR)

# ---------------------------------------------------------------------------
# Android wrapper support (all env-gated; zero behaviour change on web/VPS)
# ---------------------------------------------------------------------------
# TIPITAKA_SYNC_UPSTREAM: when set (Android app), /api/sync/* requests are
# proxied to this upstream (the VPS) instead of using a local sync.db, so
# phones keep cross-device sync while everything else runs on-device.
SYNC_UPSTREAM = os.environ.get("TIPITAKA_SYNC_UPSTREAM", "").rstrip("/")


@app.before_request
def _maybe_proxy_sync():
    if SYNC_UPSTREAM and request.path.startswith("/api/sync/"):
        return _proxy_to_upstream(request)


def _proxy_to_upstream(req):
    import urllib.request
    import urllib.error
    url = SYNC_UPSTREAM + req.path
    if req.query_string:
        url += "?" + req.query_string.decode("latin-1")
    proxy_req = urllib.request.Request(url, data=req.get_data() or None,
                                       method=req.method)
    ctype = req.headers.get("Content-Type")
    if ctype:
        proxy_req.add_header("Content-Type", ctype)
    # Cloudflare blocks non-browser User-Agents with 403 (error 1010), which
    # broke /api/sync/* from the Android app (urllib's default UA). Forward
    # the WebView's browser UA so the upstream sees a normal browser.
    proxy_req.add_header("User-Agent",
                         req.headers.get("User-Agent", "TipitakaAndroid/1.0"))
    try:
        with urllib.request.urlopen(proxy_req, timeout=25) as resp:
            return Response(resp.read(), status=resp.status,
                            content_type=resp.headers.get("Content-Type",
                                                          "application/json"))
    except urllib.error.HTTPError as e:
        return Response(e.read(), status=e.code, content_type="application/json")
    except Exception:
        # Offline / unreachable: let the client treat it as a sync failure.
        return jsonify({"error": "sync server unreachable (offline?)"}), 502


def _client_ip():
    """Best-effort client IP for rate limiting.

    X-Forwarded-For is only trusted when the request arrives from a local
    reverse proxy (loopback / private address), which is the VPS-deployment
    shape (Cloudflare/nginx -> gunicorn on 127.0.0.1). A direct client on a
    public address cannot spoof its rate-limit identity by sending XFF."""
    remote = request.remote_addr or "?"
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        ip_first = remote.split(":")[0] if remote.count(":") == 1 else remote
        try:
            import ipaddress
            is_local_proxy = (ipaddress.ip_address(ip_first).is_loopback or
                              ipaddress.ip_address(ip_first).is_private)
        except ValueError:
            is_local_proxy = False
        if is_local_proxy:
            return xff.split(",")[0].strip()
    return remote

@app.route("/api/health")
def health():
    """Tiny endpoint used by the Android wrapper to know the server is up."""
    return jsonify({"ok": True})

_ANDROID_RELEASE_FILE = os.path.join(DATA_DIR, "android_release.json")

@app.route("/api/android-update")
def android_update():
    """Returns latest Android APK release metadata for in-app updater."""
    meta = {
        "versionCode": _env_int("ANDROID_LATEST_VERSION_CODE", 2),
        "versionName": os.environ.get("ANDROID_LATEST_VERSION_NAME", "1.0.1"),
        "downloadUrl": os.environ.get(
            "ANDROID_LATEST_DOWNLOAD_URL",
            "https://github.com/uzinlay85/tipitaka_web_app_By_uzinlay/releases/download/v1.0.1/tipitaka-release.apk"
        ),
        "changelog": os.environ.get(
            "ANDROID_LATEST_CHANGELOG",
            "• အက်ပ်အတွင်း တိုက်ရိုက် အပ်ဒိတ်စစ်ဆေးပြီး ရယူနိုင်သည့် စနစ် (In-App Updater) ထည့်သွင်းထားခြင်း\n• အင်တာနက်မလိုဘဲ အော့ဖ်လိုင်းဖတ်ရှုမှု ပိုမိုကောင်းမွန်စေခြင်း"
        ),
        "forceUpdate": False
    }

    for cand in [_ANDROID_RELEASE_FILE, os.path.join(BASE_DIR, "android_release.json")]:
        if os.path.exists(cand):
            try:
                with open(cand, "r", encoding="utf-8") as f:
                    file_meta = json.load(f)
                    meta.update(file_meta)
                break
            except Exception:
                pass

    resp = jsonify(meta)
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

_STATS_CACHE = None  # (timestamp, dict) — /api/stats changes only on DB rebuild

@app.after_request
def add_cache_headers(response):
    path = request.path
    # HTML shell: always revalidate so new ?v= asset URLs are picked up
    if path == "/":
        response.headers["Cache-Control"] = "no-cache"
        return response
    # In-app updater endpoint: retain 5-minute CDN cache
    if path == "/api/android-update":
        return response
    # 1. Mutable user state: bookmarks, recent read state and annotation sync must never be cached
    if path.startswith("/api/bookmarks") or path.startswith("/api/recent") or path.startswith("/api/sync"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    # 2. Static CSS, JS, fonts: cache in browser for 30 days
    elif path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    # 3. Canonical Tipitaka text pages and catalogs: 24h browser cache, 7d CDN stale-while-revalidate
    #    (only successful responses — a transient 500/404 must never poison the cache)
    elif response.status_code == 200 and (
            path.startswith("/api/page/") or path.startswith("/api/book") or path.startswith("/api/categories") or path.startswith("/api/mm/") or path.startswith("/api/pali/companions/") or path.startswith("/api/nissaya/")):
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    return response

def _db_available(kind, local_path):
    """True when a database is reachable: via Turso (URL set) or local file.

    The app historically gated features on os.path.exists(<local DB file>);
    on Vercel there is no local file, so a configured Turso URL counts as
    available too. Local behaviour is unchanged (file exists -> True).
    """
    return turso_enabled(kind) or os.path.exists(local_path)


# Warm-instance Turso connection cache (page-speed fix C).
# Vercel reuses a warm function instance across requests, but every page
# call used to open a fresh remote libsql connection (TLS + Hrana session
# setup) and close it at teardown. Reusing the connection inside a warm
# instance removes that setup from every page turn. Connections are
# probed (SELECT 1) before reuse and recreated on failure. Local sqlite
# connections keep their existing per-request (Flask g) lifecycle — they
# are cheap and file-scoped. Vercel's Python runtime handles one request
# at a time per instance, so no lock is needed around the shared object.
_WARM_TURSO = {}


def _get_warm_turso(kind):
    """Return a live Turso connection for ``kind``, reusing the warm
    instance's connection when its probe succeeds."""
    conn = _WARM_TURSO.get(kind)
    if conn is not None:
        try:
            conn.execute("SELECT 1")
            return conn
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            _WARM_TURSO.pop(kind, None)
    conn = connect_turso(kind)
    _WARM_TURSO[kind] = conn
    return conn


def get_pali_db(readonly=True):
    """Get request-scoped read-only SQLite connection, or standalone read-write connection for mutations."""
    if not readonly:
        conn = sqlite3.connect(DB_PALI_PATH, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    conn = g.get('pali_db')
    if conn is not None:
        try:
            conn.execute("SELECT 1")
        except Exception:
            conn = None

    if conn is None:
        if turso_enabled("pali"):
            # Remote libsql: no local PRAGMAs (Hrana does not support them
            # the same way); the adapter presents the sqlite3 surface.
            # Reuse the warm instance's connection (page-speed fix C).
            conn = _get_warm_turso("pali")
        else:
            conn = sqlite3.connect(DB_PALI_RO_URI, uri=True, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA query_only = ON")
            conn.execute("PRAGMA cache_size = -64000")
            conn.execute("PRAGMA mmap_size = 268435456")
        g.pali_db = conn
    return conn

def get_mm_db():
    """Get request-scoped read-only SQLite connection for Myanmar Tipitaka database."""
    conn = g.get('mm_db')
    if conn is not None:
        try:
            conn.execute("SELECT 1")
        except Exception:
            conn = None

    if conn is None:
        if turso_enabled("mm"):
            # Reuse the warm instance's connection (page-speed fix C).
            conn = _get_warm_turso("mm")
        else:
            conn = sqlite3.connect(DB_MM_RO_URI, uri=True, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA query_only = ON")
            conn.execute("PRAGMA cache_size = -32000")
            conn.execute("PRAGMA mmap_size = 268435456")
        g.mm_db = conn
    return conn

def get_nissaya_db():
    """Get request-scoped read-only SQLite connection for the Myanmar Nissaya
    gloss database. Returns None when nissaya.db is not deployed (feature
    degrades gracefully)."""
    if not turso_enabled("nissaya") and not os.path.exists(DB_NISSAYA_PATH):
        return None
    conn = g.get('nissaya_db')
    if conn is not None:
        try:
            conn.execute("SELECT 1")
        except Exception:
            conn = None

    if conn is None:
        if turso_enabled("nissaya"):
            # Reuse the warm instance's connection (page-speed fix C).
            conn = _get_warm_turso("nissaya")
        else:
            conn = sqlite3.connect(DB_NISSAYA_RO_URI, uri=True, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA query_only = ON")
            conn.execute("PRAGMA cache_size = -32000")
        g.nissaya_db = conn
    return conn

@app.teardown_appcontext
def close_db_connections(exception=None):
    """Automatically close all request-scoped database connections.

    Turso connections are NOT closed here: they live in the warm-instance
    cache (_WARM_TURSO) and are reused across requests (page-speed fix C).
    Local sqlite connections are closed as before."""
    pali_db = g.pop('pali_db', None)
    if pali_db is not None and not turso_enabled("pali"):
        pali_db.close()
    mm_db = g.pop('mm_db', None)
    if mm_db is not None and not turso_enabled("mm"):
        mm_db.close()
    nissaya_db = g.pop('nissaya_db', None)
    if nissaya_db is not None and not turso_enabled("nissaya"):
        nissaya_db.close()

def heal_databases():
    """Auto-correct any known legacy page numbering offsets once safely without write-lock storms."""
    if not os.path.exists(DB_PALI_PATH):
        return
    try:
        conn = sqlite3.connect(DB_PALI_PATH, timeout=5.0)
        cur = conn.cursor()
        check = cur.execute("SELECT page FROM pages WHERE id = 4838 AND book_id = 'mula_sa_03'").fetchone()
        if check and check[0] == 121:
            conn.close()
            return  # Already healed, skip writes
        cur.execute("UPDATE pages SET page = 121 WHERE id = 4838 AND book_id = 'mula_sa_03' AND page = 122")
        cur.execute("UPDATE pages SET page = 195 WHERE id = 16896 AND book_id = 'attha_vi_01_01' AND page = 194")
        cur.execute("UPDATE pages SET page = 57 WHERE id = 32354 AND book_id = 'attha_ku_zat_06' AND page = 58")
        cur.execute("UPDATE books SET lastpage = 80 WHERE id = 'annya_sadda_17' AND lastpage = 81")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Pali DB self-heal notice: {e}")

heal_databases()

# Cache category names and structure
CATEGORIES_ORDER = ['vi', 'di', 'ma', 'sa', 'an', 'ku', 'bi', 'annya_vi', 'annya_bi', 'annya_sadda']
BASKET_LABELS = {
    'mula': 'ပါဠိတော် (Mūla)',
    'attha': 'အဋ္ဌကထာ (Aṭṭhakathā)',
    'tika': 'ဋီကာ (Ṭīkā)',
    'annya': 'အည (Añña)'
}

PALI_SUFFIXES = (
    '\u1031\u102b',           # ော (tall aa)
    '\u1031\u102c',           # ော (round aa)
    'ာနံ', 'ါနံ',             # -ānaṃ
    'ေဟိ', 'ေဘိ',             # -ehi, -ebhi
    'သ္မာ', 'သ္မိံ', 'မှိ', 'မှာ', # -smā, -smiṃ, -mhi, -mhā
    'ဿ', 'ာယ', 'ါယ',         # -ssa, -āya
    'ေန', 'ေသု', 'သု',         # -ena, -esu, -su
    'ေသံ', 'ေသာနံ', 'ာသံ',     # -esaṃ, -esānaṃ, -āsaṃ
    'ဉ္စ', 'ဉ္စိ', 'ဝါ', 'ပိ', 'တိ', # enclitics: -ñca, -vā, -pi, -ti
    'ာ', 'ါ', 'ေ', 'ိ', 'ီ', 'ု', 'ူ', 'ံ'
)

# Precompiled Regular Expressions for High-Performance Text Processing
RE_CLEAN_PALI = re.compile(r"[\s\d၀-၉၊။,.\-—–“’”\"'()\[\]<>:;?!/\\#*~`]+")
RE_GATHA_LEAD_QUOTE = re.compile(r'(^|^(?:<a\b[^>]*>.*?</a>|<span\b[^>]*>.*?</span>|\s)*)[\u201c\u201d\u2018\u2019"\']+\s*')
RE_GATHA_CLOSE_QUOTE = re.compile(r'[\u201c\u201d\u2018\u2019"\']+(?=(?:န္တိ|တိ)[၊။]?)')
RE_GATHA_PUNCT_QUOTE = re.compile(r'[\u201c\u201d\u2018\u2019"\']+(?=[,၊။]|\s*(?:<|$))')
RE_GATHA_AFTER_PUNCT = re.compile(r'([၊။])[\u201c\u201d\u2018\u2019"\']+')

RE_PEYALA = re.compile(r'([^\s\.\…<]?)\s*(?:…|\.{2,})\s*(?:ပေ|ပ)\s*(?:…|\.{2,})\s*[၊။]?')
RE_MULTI_SPACES = re.compile(r'[ \t]{2,}')
RE_P_TAG = re.compile(r'<p\b([^>]*)>([\s\S]*?)</p>', flags=re.I)
RE_GATHA_CLASS = re.compile(r'\bclass\s*=\s*["\'][^"\']*gatha[^"\']*["\']', flags=re.I)
RE_CLASS_ATTR = re.compile(r'\bclass\s*=\s*["\']([^"\']+)["\']', flags=re.I)
RE_LEAD_WHITESPACE = re.compile(r'^\s+')
RE_LEAD_ANCHORS_SPACE = re.compile(r'^((?:<a\b[^>]*>.*?</a>)*)\s+')
RE_COMMA_SPLIT = re.compile(r',(?![^<]*>)\s*')
RE_COMMA_REMOVE = re.compile(r',(?![^<]*>)')
RE_COMMA_PROSE = re.compile(r',(?![^<]*>)')
RE_QUESTION_EXCLAMATION = re.compile(r'[?!](?![^<]*>)')
RE_SEMICOLON = re.compile(r';(?![^<]*>)')
RE_VOCATIVES_BEFORE = re.compile(
    r'[၊,]\s*((?:<[^>]+>)*\s*)(ဘိက္ခဝေ|ဘိက္ခဝေါ|ဘန္တေ|အာဝုသော|မဟာရာဇ|မဟာရာဇာ|အာနန္ဒ|ဗြာဟ္မဏ|တာတ|ဒေဝ|သာရိပုတ္တ|မောဂ္ဂလ္လာန|ကဿပ|ဥပါလိ|သုဘဒ္ဒ|ဂေါတမ)(?=[<၊။,\s”’"\'\)\]}}]|$)'
)
RE_VOCATIVES_AFTER = re.compile(
    r'(ဘိက္ခဝေ|ဘိက္ခဝေါ|ဘန္တေ|အာဝုသော|မဟာရာဇ|မဟာရာဇာ|အာနန္ဒ|ဗြာဟ္မဏ|တာတ|ဒေဝ|သာရိပုတ္တ|မောဂ္ဂလ္လာန|ကဿပ|ဥပါလိ|သုဘဒ္ဒ|ဂေါတမ)((?:<[^>]+>)*)\s*[၊,]'
)
RE_PARTICLES = re.compile(
    r'(^|[\s"\'“‘\(])(န|နော|မာ|စ|ဝါ|ဟိ|တု|ပန|ခေါ|ဝတ|ဟန္ဒ)((?:<[^>]+>)*)\s*[၊,]'
)
RE_PADA_NON_FINAL = re.compile(r'[၊။]([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$')
RE_PADA_CHECK_PUNCT = re.compile(r'[၊]([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$')
RE_PADA_CHECK_SECTION = re.compile(r'[။]([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$')
RE_UNSPAN = re.compile(r'<span class="(?:pali-word|no-split)">([\s\S]*?)</span>')
RE_HTML_TAGS = re.compile(r'(<[^>]+>)')
RE_SYMBOLS_ONLY = re.compile(r'^[\s\d၀-၉၊။,.\-—–“’”"\'()\[\]<>:;?!/\\#*~`]+$')
RE_NON_SPACE = re.compile(r'\S+')
RE_STACKED_CONJUNCT = re.compile(r'([\u1000-\u1021\u1004\u103a]\u1039[\u1000-\u1021])')
RE_UNSPAN_NO_SPLIT = re.compile(r'<span class="no-split">([\s\S]*?)</span>')
RE_PEYALA_CLEAN_MM = re.compile(r'။\s*ပ\s*။')

def clean_pali_word(word):
    if not word:
        return ""
    return RE_CLEAN_PALI.sub("", word).strip()

def clean_gatha_quotes(text):
    if not text:
        return ""
    text = RE_GATHA_LEAD_QUOTE.sub(r'\1', text)
    text = RE_GATHA_CLOSE_QUOTE.sub('', text)
    text = RE_GATHA_PUNCT_QUOTE.sub('', text)
    text = RE_GATHA_AFTER_PUNCT.sub(r'\1', text)
    return text

def format_chattasangayana_pali(html):
    if not html:
        return ""
    
    # 1. Clean peyala abbreviations (...ပ..., ...ပေ..., …ပ…, …ပေ…) to "။ ပ ။"
    def repl_peyala(m):
        prefix = m.group(1)
        if prefix in ['။', '၊']:
            return f"{prefix} ။ ပ ။ "
        elif prefix:
            return f"{prefix}။ ပ ။ "
        else:
            return "။ ပ ။ "
            
    res_html = RE_PEYALA.sub(repl_peyala, html)
    res_html = RE_MULTI_SPACES.sub(' ', res_html)
    
    # 2. Process paragraphs for gāthās and prose
    def repl_p(m):
        attrs = m.group(1)
        content = m.group(2)
        if RE_GATHA_CLASS.search(attrs):
            cls_m = RE_CLASS_ATTR.search(attrs)
            cls_name = cls_m.group(1).lower() if cls_m else ""
            
            # If already wrapped in gatha-pada, preserve
            if '<span class="gatha-pada' in content:
                return f'<p{attrs}>{content}</p>'

            # Clean leading whitespace inside gatha paragraph so lines align perfectly
            content = RE_LEAD_WHITESPACE.sub('', content)
            content = RE_LEAD_ANCHORS_SPACE.sub(r'\1', content)
            content = clean_gatha_quotes(content)
            
            # Process padas: if separated by comma, wrap each pada in <span class="gatha-pada">
            if ',' in content and re.search(r',(?![^<]*>)', content):
                parts = RE_COMMA_SPLIT.split(content)
                padas = []
                for i, part in enumerate(parts):
                    p = clean_gatha_quotes(part.strip())
                    if i < len(parts) - 1:
                        p = RE_PADA_NON_FINAL.sub(r'၊\1', p)
                        if not RE_PADA_CHECK_PUNCT.search(p):
                            p = p + '၊'
                    else:
                        p = RE_PADA_NON_FINAL.sub(r'။\1', p)
                        if not RE_PADA_CHECK_SECTION.search(p):
                            p = p + '။'
                    p = clean_gatha_quotes(p)
                    padas.append(f'<span class="gatha-pada pada{i+1}">{p}</span>')
                res = ' '.join(padas)
                return f'<p{attrs}>{res}</p>'
            else:
                p = clean_gatha_quotes(content.strip())
                if 'gatha2' in cls_name or 'gatha4' in cls_name or 'gathalast' in cls_name:
                    if re.search(r'၊([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$', p):
                        p = re.sub(r'၊([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$', r'။\1', p)
                    elif not re.search(r'။([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$', p):
                        p = p + '။'
                elif 'gatha1' in cls_name or 'gatha3' in cls_name:
                    if not re.search(r'[၊။]([’"”’\'\s]*(?:<[^>]+>[’"”’\'\s]*)*)$', p):
                        p = p + '၊'
                p = clean_gatha_quotes(p)
                return f'<p{attrs}><span class="gatha-pada">{p}</span></p>'
        else:
            # Prose: preserve legitimate pauses as Myanmar pada-thi (၊),
            # convert semicolons to ၊, convert ?/! to pada-ma (။),
            # and strip unwanted Western commas around vocatives & short particles
            # matching printed Chaṭṭha Saṅgāyana standard.
            cleaned = RE_COMMA_PROSE.sub('၊', content)
            cleaned = RE_SEMICOLON.sub('၊', cleaned)
            cleaned = RE_QUESTION_EXCLAMATION.sub('။', cleaned)
            cleaned = RE_VOCATIVES_BEFORE.sub(r' \1\2', cleaned)
            cleaned = RE_VOCATIVES_AFTER.sub(r'\1\2 ', cleaned)
            cleaned = RE_PARTICLES.sub(r'\1\2\3 ', cleaned)
            cleaned = re.sub(r'၊\s*၊', '၊', cleaned)
            cleaned = re.sub(r'၊\s*။', '။', cleaned)
            cleaned = re.sub(r'။\s*။', '။', cleaned)
            cleaned = RE_MULTI_SPACES.sub(' ', cleaned)
            return f'<p{attrs}>{cleaned}</p>'
            
    res_html = RE_P_TAG.sub(repl_p, res_html)

    # 3. Protect Pali words (wrap in <span class="pali-word">) so browser never splits stacked consonants (+) across line breaks
    unspanned = RE_UNSPAN.sub(r'\1', res_html)
    parts = RE_HTML_TAGS.split(unspanned)
    res_parts = []
    for part in parts:
        if not part or part.startswith('<'):
            res_parts.append(part)
        else:
            def repl_w(m):
                w = m.group(0)
                if RE_SYMBOLS_ONLY.match(w):
                    return w
                if len(w) <= 35:
                    return f'<span class="pali-word">{w}</span>'
                else:
                    return RE_STACKED_CONJUNCT.sub(r'<span class="no-split">\1</span>', w)
            res_parts.append(RE_NON_SPACE.sub(repl_w, part))
    return ''.join(res_parts)

def format_chattasangayana_mm(html):
    if not html:
        return ""
    def repl_peyala(m):
        prefix = m.group(1)
        if prefix in ['။', '၊']:
            return f"{prefix} ။ ပ ။ "
        elif prefix:
            return f"{prefix}။ ပ ။ "
        else:
            return "။ ပ ။ "
            
    res = RE_PEYALA.sub(repl_peyala, html)
    res = RE_PEYALA_CLEAN_MM.sub('။ ပ ။ ', res)
    res = RE_MULTI_SPACES.sub(' ', res)

    # Protect stacked consonants in Myanmar translation text so virama (+) never splits across lines
    unspanned = RE_UNSPAN_NO_SPLIT.sub(r'\1', res)
    parts = RE_HTML_TAGS.split(unspanned)
    res_parts = []
    for part in parts:
        if not part or part.startswith('<'):
            res_parts.append(part)
        else:
            res_parts.append(RE_STACKED_CONJUNCT.sub(r'<span class="no-split">\1</span>', part))
    return ''.join(res_parts)

@lru_cache(maxsize=1024)
def _cached_format_pali(html):
    return format_chattasangayana_pali(html)

@lru_cache(maxsize=1024)
def _cached_format_mm(html):
    return format_chattasangayana_mm(html)


@app.route("/")
def index():
    return render_template("index.html",
                           app_version=APP_VERSION,
                           app_created_date=APP_CREATED_DATE)

# NOTE: /download-vps-zip and /download-code-update were removed (2026-09-28).
# They publicly exposed a ~157MB archive of the full source + databases and
# let anyone saturate the server by re-downloading it. Transfer deploy files
# with scp/SFTP instead.

@app.route("/api/stats")
def api_stats():
    # Counts only change when the databases are rebuilt, so cache for an hour
    # instead of running 7 COUNT(*) queries on every home-page visit.
    global _STATS_CACHE
    now = time.time()
    if _STATS_CACHE and now - _STATS_CACHE[0] < 3600:
        return jsonify(_STATS_CACHE[1])
    conn_p = get_pali_db()
    cur_p = conn_p.cursor()
    books_count = cur_p.execute("SELECT count(*) FROM books").fetchone()[0]
    pages_count = cur_p.execute("SELECT count(*) FROM pages").fetchone()[0]
    suttas_count = cur_p.execute("SELECT count(*) FROM suttas").fetchone()[0]
    dict_count = cur_p.execute("SELECT count(*) FROM dictionary").fetchone()[0]
    words_count = cur_p.execute("SELECT count(*) FROM wordlist").fetchone()[0]

    mm_books_count = 0
    mm_pages_count = 0
    if _db_available("mm", DB_MM_PATH):
        conn_m = get_mm_db()
        cur_m = conn_m.cursor()
        mm_books_count = cur_m.execute("SELECT count(*) FROM book").fetchone()[0]
        mm_pages_count = cur_m.execute("SELECT count(*) FROM mm_pages").fetchone()[0]

    result = {
        "books": books_count,
        "pages": pages_count,
        "suttas": suttas_count,
        "dictionary_words": dict_count,
        "indexed_words": words_count,
        "mm_books": mm_books_count,
        "mm_pages": mm_pages_count
    }
    _STATS_CACHE = (now, result)
    return jsonify(result)

# ----------------- Pali APIs -----------------

@app.route("/api/categories")
def api_categories():
    conn = get_pali_db()
    cur = conn.cursor()
    cats = cur.execute("SELECT id, name, basket FROM category").fetchall()
    
    books = cur.execute("""
        SELECT id, basket, category, name, short_name, firstpage, lastpage, pagecount 
        FROM books 
        ORDER BY id ASC
    """).fetchall()

    cat_map = {c["id"]: {"id": c["id"], "name": c["name"], "basket": c["basket"], "books": []} for c in cats}
    for b in books:
        cid = b["category"]
        if cid in cat_map:
            cat_map[cid]["books"].append({
                "id": b["id"],
                "basket": b["basket"],
                "basket_label": BASKET_LABELS.get(b["basket"], b["basket"]),
                "category": b["category"],
                "name": b["name"],
                "short_name": b["short_name"],
                "firstpage": b["firstpage"],
                "lastpage": b["lastpage"],
                "pagecount": b["pagecount"]
            })

    ordered = []
    for cid in CATEGORIES_ORDER:
        if cid in cat_map:
            ordered.append(cat_map[cid])
    for cid, val in cat_map.items():
        if cid not in CATEGORIES_ORDER:
            ordered.append(val)

    return jsonify(ordered)

@app.route("/api/books")
def api_books():
    conn = get_pali_db()
    cur = conn.cursor()
    books = cur.execute("""
        SELECT b.id, b.basket, b.category, c.name as category_name, b.name, b.short_name, b.firstpage, b.lastpage, b.pagecount 
        FROM books b
        LEFT JOIN category c ON b.category = c.id
        ORDER BY b.id ASC
    """).fetchall()
    return jsonify([dict(b) for b in books])

@app.route("/api/book/<book_id>")
def api_book(book_id):
    conn = get_pali_db()
    cur = conn.cursor()
    
    book = cur.execute("""
        SELECT b.id, b.basket, b.category, c.name as category_name, b.name, b.short_name, b.firstpage, b.lastpage, b.pagecount 
        FROM books b
        LEFT JOIN category c ON b.category = c.id
        WHERE b.id = ?
    """, (book_id,)).fetchone()
    
    if not book:
        return jsonify({"error": "Book not found"}), 404

    tocs = cur.execute("""
        SELECT name, type, page_number 
        FROM tocs 
        WHERE book_id = ? 
        ORDER BY page_number ASC, rowid ASC
    """, (book_id,)).fetchall()

    suttas = cur.execute("""
        SELECT name, page_number, sutta_id, nikaya, volume, section, sutta_number 
        FROM suttas 
        WHERE book_id = ? 
        ORDER BY page_number ASC
    """, (book_id,)).fetchall()

    related = []
    matches = cur.execute("""
        SELECT m.base, b1.name as base_name, m.exp, b2.name as exp_name
        FROM pali_attha_tika_match m
        JOIN books b1 ON m.base = b1.id
        JOIN books b2 ON m.exp = b2.id
        WHERE m.base = ? OR m.exp = ?
    """, (book_id, book_id)).fetchall()

    for m in matches:
        if m["base"] == book_id:
            related.append({"id": m["exp"], "name": m["exp_name"], "rel_type": "commentary"})
        else:
            related.append({"id": m["base"], "name": m["base_name"], "rel_type": "root"})

    # Check matching Myanmar book
    matching_mm_book = None
    if _db_available("mm", DB_MM_PATH):
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        src = m_cur.execute("""
            SELECT sb.mm_book_id, b.name 
            FROM source_book sb 
            JOIN book b ON sb.mm_book_id = b.id 
            WHERE sb.pali_book_id = ?
        """, (book_id,)).fetchone()
        if src:
            matching_mm_book = {"book_id": src[0], "book_name": src[1]}

    companions = get_companion_books(book_id)

    return jsonify({
        "book": dict(book),
        "tocs": [dict(t) for t in tocs],
        "suttas": [dict(s) for s in suttas],
        "related": related,
        "matching_mm_book": matching_mm_book,
        "companions": companions
    })

def get_companion_books(book_id):
    if not _db_available("pali", DB_PALI_PATH):
        return None
    conn = get_pali_db()
    cur = conn.cursor()
    cur_book = cur.execute("SELECT id, name, basket, category FROM books WHERE id = ?", (book_id,)).fetchone()
    if not cur_book:
        return None

    books = cur.execute("SELECT id, name, basket FROM books").fetchall()
    book_map = {b["id"]: {"id": b["id"], "name": b["name"], "basket": b["basket"]} for b in books}

    root_id = book_id if cur_book["basket"] == "mula" else None
    if not root_id:
        matches = cur.execute("SELECT base, exp FROM pali_attha_tika_match WHERE base = ? OR exp = ?", (book_id, book_id)).fetchall()
        for row in matches:
            other = row[1] if row[0] == book_id else row[0]
            if other in book_map and book_map[other]["basket"] == "mula":
                root_id = other
                break

    all_related = set()
    if root_id:
        all_related.add(root_id)
        matches = cur.execute("SELECT base, exp FROM pali_attha_tika_match WHERE base = ? OR exp = ?", (root_id, root_id)).fetchall()
        for row in matches:
            other = row[1] if row[0] == root_id else row[0]
            all_related.add(other)
    else:
        matches = cur.execute("SELECT base, exp FROM pali_attha_tika_match WHERE base = ? OR exp = ?", (book_id, book_id)).fetchall()
        for row in matches:
            other = row[1] if row[0] == book_id else row[0]
            all_related.add(other)

    mula_list = [book_map[b] for b in sorted(all_related) if b in book_map and book_map[b]["basket"] == "mula" and b != book_id]
    attha_list = [book_map[b] for b in sorted(all_related) if b in book_map and book_map[b]["basket"] == "attha" and b != book_id]
    tika_list = [book_map[b] for b in sorted(all_related) if b in book_map and book_map[b]["basket"] == "tika" and b != book_id]

    mm_list = []
    if _db_available("mm", DB_MM_PATH):
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        search_pali_ids = [book_id]
        if root_id and root_id != book_id:
            search_pali_ids.append(root_id)
        for pid in search_pali_ids:
            srcs = m_cur.execute("""
                SELECT sb.mm_book_id, b.name 
                FROM source_book sb 
                JOIN book b ON sb.mm_book_id = b.id 
                WHERE sb.pali_book_id = ?
            """, (pid,)).fetchall()
            for s in srcs:
                if not any(m["id"] == s[0] for m in mm_list):
                    mm_list.append({"id": s[0], "name": s[1]})

    return {
        "current": {
            "id": cur_book["id"],
            "name": cur_book["name"],
            "basket": cur_book["basket"]
        },
        "root_id": root_id,
        "mula": mula_list,
        "attha": attha_list,
        "tika": tika_list,
        "mm": mm_list
    }

@app.route("/api/pali/companions/<book_id>")
def api_pali_companions(book_id):
    res = get_companion_books(book_id)
    if not res:
        return jsonify({"error": "Book not found"}), 404
    return jsonify(res)

@app.route("/api/page/<book_id>/<int:page_num>")
def api_page(book_id, page_num):
    # ?light=1: skip the Myanmar cross-link lookup (page-speed fix B).
    # Feed appends/prepends never render matching_mm — the cross-link
    # button keeps the value from the first full load — so they must not
    # pay for a second database connection plus up to 3 extra queries.
    light = request.args.get("light") == "1"
    conn = get_pali_db()
    cur = conn.cursor()

    book = cur.execute("SELECT id, name, firstpage, lastpage, pagecount FROM books WHERE id = ?", (book_id,)).fetchone()
    if not book:
        return jsonify({"error": "Book not found"}), 404

    if page_num < book["firstpage"]:
        page_num = book["firstpage"]
    elif page_num > book["lastpage"]:
        page_num = book["lastpage"]

    page_row = cur.execute("""
        SELECT id, book_id, page, content, paranum 
        FROM pages 
        WHERE book_id = ? AND page = ?
    """, (book_id, page_num)).fetchone()

    current_toc = cur.execute("""
        SELECT name, type 
        FROM tocs 
        WHERE book_id = ? AND page_number <= ? 
        ORDER BY page_number DESC LIMIT 1
    """, (book_id, page_num)).fetchone()

    # Find matching Myanmar translation page
    matching_mm = None
    if not light and _db_available("mm", DB_MM_PATH):
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        
        # Try page map first
        pmap = m_cur.execute("""
            SELECT m.mm_book_id, b.name, m.mm_page_number
            FROM mm_pali_page_map m
            JOIN book b ON m.mm_book_id = b.id
            WHERE m.pali_book_id = ? AND m.pali_page_number = ?
        """, (book_id, page_num)).fetchone()

        if pmap:
            matching_mm = {"book_id": pmap[0], "book_name": pmap[1], "page": pmap[2]}
        else:
            # Try source_book and paragraph number with majority voting
            src = m_cur.execute("""
                SELECT sb.mm_book_id, b.name, sb.link_type
                FROM source_book sb
                JOIN book b ON sb.mm_book_id = b.id
                WHERE sb.pali_book_id = ?
            """, (book_id,)).fetchone()
            if src:
                mm_bid, mm_bname, ltype = src
                target_mm_pg = 1
                nums = []
                if page_row and page_row["paranum"]:
                    nums = [int(n) for n in str(page_row["paranum"]).split('-') if n.isdigit()]
                
                # Check content for paragraph markers if nums empty
                if not nums and page_row and page_row["content"]:
                    found = re.findall(r'para(\d+)', page_row["content"])
                    nums = [int(n) for n in found if n.isdigit()]

                if nums:
                    # Count frequency of target MM pages across all paragraph numbers on this page
                    # Pick the page that contains the majority of the paragraphs.
                    # Single batched query (was one query per paragraph number).
                    placeholders = ",".join("?" * len(nums))
                    page_counts = {}
                    for (pg,) in m_cur.execute(
                            f"SELECT page_number FROM paragraphs WHERE book_id = ? AND paragraph_number IN ({placeholders})",
                            (mm_bid, *nums)):
                        page_counts[pg] = page_counts.get(pg, 0) + 1
                    
                    if page_counts:
                        best_pg = max(page_counts.items(), key=lambda x: (x[1], x[0]))[0]
                        target_mm_pg = best_pg
                    else:
                        mp = m_cur.execute("SELECT page_number FROM paragraphs WHERE book_id = ? AND paragraph_number = ?", (mm_bid, nums[0])).fetchone()
                        if mp:
                            target_mm_pg = mp[0]

                matching_mm = {"book_id": mm_bid, "book_name": mm_bname, "page": target_mm_pg, "paragraphs": nums}

    content_html = page_row["content"] if page_row else "<p>ဤစာမျက်နှာအတွက် အချက်အလက်မရှိပါ။</p>"
    if content_html:
        content_html = _cached_format_pali(content_html)

    return jsonify({
        "book_id": book_id,
        "book_name": book["name"],
        "page": page_num,
        "first_page": book["firstpage"],
        "last_page": book["lastpage"],
        "page_count": book["pagecount"],
        "has_prev": page_num > book["firstpage"],
        "has_next": page_num < book["lastpage"],
        "prev_page": page_num - 1 if page_num > book["firstpage"] else None,
        "next_page": page_num + 1 if page_num < book["lastpage"] else None,
        "paranum": page_row["paranum"] if page_row else "",
        "chapter_name": current_toc["name"] if current_toc else "",
        "content": content_html,
        "matching_mm": matching_mm
    })

# ----------------- Myanmar Nissaya glosses -----------------

def make_nissaya_snippet(gloss, query, max_len=180):
    """Extract and highlight the most relevant clause from a word-by-word Nissaya gloss."""
    if not gloss or not query:
        return ""
    segments = [s.strip() for s in gloss.split("|") if s.strip()]
    matched_segments = [s for s in segments if query.lower() in s.lower()]

    if matched_segments:
        chosen = []
        cur_len = 0
        for seg in matched_segments:
            if cur_len + len(seg) > max_len and chosen:
                break
            chosen.append(seg)
            cur_len += len(seg)
        raw_snippet = " | ".join(chosen)
    else:
        idx = gloss.lower().find(query.lower())
        if idx == -1:
            raw_snippet = gloss[:max_len]
        else:
            start = max(0, idx - 50)
            end = min(len(gloss), idx + len(query) + 80)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(gloss) else ""
            raw_snippet = prefix + gloss[start:end] + suffix

    pattern = re.compile(re.escape(query), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group(0)}</mark>", raw_snippet)

@app.route("/api/nissaya/<book_id>/<int:page_num>")
def api_nissaya(book_id, page_num):
    """Return Myanmar Nissaya glosses for one Pāḷi page.

    Response: {"available": bool, "glosses": {"<paragraph_number>": "<gloss>"}}.
    `available` is False when nissaya.db is not deployed or the book has no
    nissaya data — the frontend hides the toggle in that case.
    Enriches Attha/Tika commentaries via root Mūla paragraph mapping when direct
    commentary glosses are unmapped. Excludes mula_ku_10 (Jataka episode mismatch).
    """
    if book_id == "mula_ku_10":
        return jsonify({"available": False, "glosses": {}})

    n_conn = get_nissaya_db()
    if n_conn is None:
        return jsonify({"available": False, "glosses": {}})

    glosses = {}
    try:
        rows = n_conn.execute(
            "SELECT paragraph_number, gloss FROM nissaya_gloss "
            "WHERE book_id = ? AND page_number = ?",
            (book_id, page_num)).fetchall()
        for r in rows:
            glosses[str(r["paragraph_number"])] = r["gloss"]
    except Exception:
        pass

    # Enhanced Attha/Tika fallback: if glosses are missing for this page,
    # inspect the page's paranum and paragraph_mapping to find root Mūla glosses.
    if not glosses and (book_id.startswith("attha_") or book_id.startswith("tika_")):
        try:
            p_conn = get_pali_db()
            page_row = p_conn.execute(
                "SELECT paranum FROM pages WHERE book_id = ? AND page = ?",
                (book_id, page_num)).fetchone()

            target_paras = []
            if page_row and page_row["paranum"]:
                nums = [int(x) for x in page_row["paranum"].strip("-").split("-") if x.isdigit()]
                target_paras.extend(nums)

            pm_rows = p_conn.execute(
                "SELECT paragraph, from_book_id FROM paragraph_mapping "
                "WHERE to_book_id = ? AND to_page_number = ?",
                (book_id, page_num)).fetchall()

            base_books = set()
            for pm in pm_rows:
                if pm["paragraph"] not in target_paras:
                    target_paras.append(pm["paragraph"])
                if pm["from_book_id"]:
                    base_books.add(pm["from_book_id"])

            if not base_books:
                match_rows = p_conn.execute(
                    "SELECT base FROM pali_attha_tika_match WHERE exp = ?",
                    (book_id,)).fetchall()
                for mr in match_rows:
                    if mr["base"]:
                        base_books.add(mr["base"])
                        # 2-hop traversal to root Mūla for Ṭīkā
                        m2_rows = p_conn.execute(
                            "SELECT base FROM pali_attha_tika_match WHERE exp = ?",
                            (mr["base"],)).fetchall()
                        for m2 in m2_rows:
                            if m2["base"]:
                                base_books.add(m2["base"])

            if target_paras and base_books:
                placeholders = ",".join("?" for _ in target_paras)
                for b_id in base_books:
                    if b_id == "mula_ku_10":
                        continue
                    fb_rows = n_conn.execute(
                        f"SELECT paragraph_number, gloss FROM nissaya_gloss "
                        f"WHERE book_id = ? AND paragraph_number IN ({placeholders})",
                        [b_id] + target_paras).fetchall()
                    for r in fb_rows:
                        p_str = str(r["paragraph_number"])
                        if p_str not in glosses:
                            glosses[p_str] = r["gloss"]
        except Exception:
            pass

    return jsonify({"available": len(glosses) > 0, "glosses": glosses})

@app.route("/api/nissaya/available/<book_id>")
def api_nissaya_available(book_id):
    """Lightweight check: does this book (or its commentary root) have any nissaya glosses?"""
    if book_id == "mula_ku_10":
        return jsonify({"available": False})
    n_conn = get_nissaya_db()
    if n_conn is None:
        return jsonify({"available": False})
    try:
        row = n_conn.execute(
            "SELECT 1 FROM nissaya_gloss WHERE book_id = ? LIMIT 1",
            (book_id,)).fetchone()
        if row is not None:
            return jsonify({"available": True})

        # Check commentary root fallback (including 2-hop for Ṭīkā)
        if book_id.startswith("attha_") or book_id.startswith("tika_"):
            p_conn = get_pali_db()
            match_rows = p_conn.execute(
                "SELECT base FROM pali_attha_tika_match WHERE exp = ?",
                (book_id,)).fetchall()
            for mr in match_rows:
                b = mr["base"]
                if b and b != "mula_ku_10":
                    if n_conn.execute("SELECT 1 FROM nissaya_gloss WHERE book_id = ? LIMIT 1", (b,)).fetchone():
                        return jsonify({"available": True})
                    # 2-hop check for Ṭīkā -> Atthakathā -> Mūla
                    m2_rows = p_conn.execute(
                        "SELECT base FROM pali_attha_tika_match WHERE exp = ?",
                        (b,)).fetchall()
                    for m2 in m2_rows:
                        b2 = m2["base"]
                        if b2 and b2 != "mula_ku_10" and n_conn.execute("SELECT 1 FROM nissaya_gloss WHERE book_id = ? LIMIT 1", (b2,)).fetchone():
                            return jsonify({"available": True})
    except Exception:
        return jsonify({"available": False})
    return jsonify({"available": False})

# ----------------- Book Export (Word / PDF) -----------------

@app.route("/api/export/<mode>/<book_id>")
def api_export(mode, book_id):
    """Download a book (or page range) as a Word (.docx) file.

    Query params: from=<page>, to=<page>, format=docx
    """
    from flask import send_file

    if mode not in ("pali", "mm"):
        return jsonify({"error": "mode must be pali or mm"}), 400
    fmt = (request.args.get("format") or "docx").lower()
    if fmt != "docx":
        return jsonify({"error": "only docx format is supported"}), 400

    # Rate limit: 10 exports / hour / IP (files are expensive to build)
    ip = _client_ip()
    if not _rate_ok(ip, limit=10, window=3600):
        return jsonify({"error": "too many downloads, try again later"}), 429

    if mode == "pali":
        conn = get_pali_db()
        cur = conn.cursor()
        book = cur.execute(
            "SELECT id, name, firstpage, lastpage, pagecount FROM books WHERE id = ?",
            (book_id,)).fetchone()
        if not book:
            return jsonify({"error": "Book not found"}), 404
        first, last = book["firstpage"], book["lastpage"]
        book_name = book["name"]
        edition = "ပါဠိတော်"
        table = "pages"
    else:
        if not _db_available("mm", DB_MM_PATH):
            return jsonify({"error": "Myanmar DB not available"}), 404
        conn = get_mm_db()
        cur = conn.cursor()
        book = cur.execute(
            "SELECT id, name, first_page, last_page, number_of_pages FROM book WHERE id = ?",
            (book_id,)).fetchone()
        if not book:
            return jsonify({"error": "Book not found"}), 404
        first, last = book["first_page"], book["last_page"]
        book_name = book["name"]
        edition = "မြန်မာပြန်"
        table = "mm_pages"

    def _to_int(v, default):
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    p_from = _to_int(request.args.get("from"), first)
    p_to = _to_int(request.args.get("to"), last)
    p_from = max(first, min(last, p_from))
    p_to = max(first, min(last, p_to))
    if p_from > p_to:
        p_from, p_to = p_to, p_from
    if p_to - p_from + 1 > 1000:
        return jsonify({"error": "page range too large (max 1000 pages)"}), 400

    rows = cur.execute(
        "SELECT page, content FROM %s WHERE book_id = ? AND page BETWEEN ? AND ? ORDER BY page ASC"
        % table, (book_id, p_from, p_to)).fetchall()

    from export_doc import parse_page, build_docx
    # Apply the same Chatthasangayana purification the reader uses
    # (gatha pada-thi/pada-ma, peyyala, quote cleanup, conjunct protection),
    # so the Word file matches what the web shows.
    fmt = _cached_format_pali if mode == "pali" else _cached_format_mm
    pages = [(r["page"], parse_page(fmt(r["content"]))) for r in rows]

    data = build_docx(book_name, pages, edition)
    mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ext = "docx"

    filename = "tipitaka_%s_p%d-%d.%s" % (book_id, p_from, p_to, ext)
    resp = send_file(io.BytesIO(data), mimetype=mimetype, as_attachment=True,
                     download_name=filename)
    resp.headers["Cache-Control"] = "no-store"
    return resp

# ----------------- Myanmar Translation APIs -----------------

@app.route("/api/mm/categories")
def api_mm_categories():
    if not _db_available("mm", DB_MM_PATH):
        return jsonify([])
    conn = get_mm_db()
    cur = conn.cursor()
    cats = cur.execute("SELECT id, name FROM category ORDER BY id ASC").fetchall()
    books = cur.execute("SELECT id, category_id, name, first_page, last_page, number_of_pages FROM book ORDER BY id ASC").fetchall()

    cat_map = {c["id"]: {"id": c["id"], "name": c["name"], "books": []} for c in cats}
    for b in books:
        cid = b["category_id"]
        if cid in cat_map:
            cat_map[cid]["books"].append({
                "id": b["id"],
                "name": b["name"],
                "first_page": b["first_page"],
                "last_page": b["last_page"],
                "page_count": b["number_of_pages"]
            })

    return jsonify(list(cat_map.values()))

@app.route("/api/mm/books")
def api_mm_books():
    if not _db_available("mm", DB_MM_PATH):
        return jsonify([])
    conn = get_mm_db()
    cur = conn.cursor()
    books = cur.execute("""
        SELECT b.id, b.category_id, c.name as category_name, b.name, b.first_page, b.last_page, b.number_of_pages as page_count
        FROM book b
        JOIN category c ON b.category_id = c.id
        ORDER BY b.id ASC
    """).fetchall()
    return jsonify([dict(b) for b in books])

@app.route("/api/mm/book/<book_id>")
def api_mm_book(book_id):
    if not _db_available("mm", DB_MM_PATH):
        return jsonify({"error": "Myanmar database not found"}), 404
    conn = get_mm_db()
    cur = conn.cursor()

    book = cur.execute("""
        SELECT b.id, b.category_id, c.name as category_name, b.name, b.first_page, b.last_page, b.number_of_pages as page_count
        FROM book b
        JOIN category c ON b.category_id = c.id
        WHERE b.id = ?
    """, (book_id,)).fetchone()

    if not book:
        return jsonify({"error": "Myanmar book not found"}), 404

    tocs = cur.execute("""
        SELECT name, type, page_number 
        FROM toc 
        WHERE book_id = ? 
        ORDER BY page_number ASC, rowid ASC
    """, (book_id,)).fetchall()

    suttas = cur.execute("""
        SELECT name, page_number 
        FROM sutta 
        WHERE book_id = ? 
        ORDER BY page_number ASC
    """, (book_id,)).fetchall()

    # Corresponding Pali book
    matching_pali_book = None
    src = cur.execute("""
        SELECT sb.pali_book_id, sb.link_type
        FROM source_book sb
        WHERE sb.mm_book_id = ?
    """, (book_id,)).fetchone()

    if src:
        # Get pali book name from pali db
        p_conn = get_pali_db()
        p_cur = p_conn.cursor()
        pb = p_cur.execute("SELECT name FROM books WHERE id = ?", (src[0],)).fetchone()
        if pb:
            matching_pali_book = {"book_id": src[0], "book_name": pb[0]}

    return jsonify({
        "book": dict(book),
        "tocs": [dict(t) for t in tocs],
        "suttas": [dict(s) for s in suttas],
        "matching_pali_book": matching_pali_book
    })

@app.route("/api/mm/page/<book_id>/<int:page_num>")
def api_mm_page(book_id, page_num):
    # ?light=1: skip the Pali cross-link lookup (page-speed fix B, same
    # reasoning as api_page — feed appends never render matching_pali).
    light = request.args.get("light") == "1"
    if not _db_available("mm", DB_MM_PATH):
        return jsonify({"error": "Myanmar database not found"}), 404
    conn = get_mm_db()
    cur = conn.cursor()

    book = cur.execute("SELECT id, name, first_page, last_page, number_of_pages FROM book WHERE id = ?", (book_id,)).fetchone()
    if not book:
        return jsonify({"error": "Myanmar book not found"}), 404

    if page_num < book["first_page"]:
        page_num = book["first_page"]
    elif page_num > book["last_page"]:
        page_num = book["last_page"]

    page_row = cur.execute("SELECT content FROM mm_pages WHERE book_id = ? AND page = ?", (book_id, page_num)).fetchone()

    current_toc = cur.execute("""
        SELECT name 
        FROM toc 
        WHERE book_id = ? AND page_number <= ? 
        ORDER BY page_number DESC LIMIT 1
    """, (book_id, page_num)).fetchone()

    # Find matching Pali page (skipped with ?light=1 — feed appends never
    # render matching_pali; see api_page).
    matching_pali = None
    pmap = None
    if not light:
        pmap = cur.execute("""
            SELECT pali_book_id, pali_page_number 
            FROM mm_pali_page_map 
            WHERE mm_book_id = ? AND mm_page_number = ?
        """, (book_id, page_num)).fetchone()

    if pmap:
        p_conn = get_pali_db()
        p_cur = p_conn.cursor()
        pb = p_cur.execute("SELECT name FROM books WHERE id = ?", (pmap[0],)).fetchone()
        if pb:
            matching_pali = {"book_id": pmap[0], "book_name": pb[0], "page": pmap[1]}
    elif not light:
        src = cur.execute("SELECT pali_book_id FROM source_book WHERE mm_book_id = ?", (book_id,)).fetchone()
        if src:
            p_bid = src[0]
            # Paragraphs to pali page with majority voting
            paras = cur.execute("SELECT paragraph_number FROM paragraphs WHERE book_id = ? AND page_number = ?", (book_id, page_num)).fetchall()
            target_pali_page = 1
            nums = [p[0] for p in paras]
            p_conn = get_pali_db()
            p_cur = p_conn.cursor()
            if nums:
                # One plain lookup for the book's pages, then vote in Python
                # (page-speed fix F). The old version ran one leading-wildcard
                # LIKE per paragraph number — a pattern no index can serve —
                # over every page of the book. Majority vote: each paragraph
                # number votes once, for the first (lowest) page whose
                # paranum contains it.
                rows = p_cur.execute(
                    "SELECT page, paranum FROM pages WHERE book_id = ? AND paranum IS NOT NULL AND paranum != '' ORDER BY page",
                    (p_bid,)).fetchall()
                row_segs = [(pg, set(str(pn).split("-"))) for pg, pn in rows]
                pali_page_counts = {}
                for num in nums:
                    ns = str(num)
                    for pg, segs in row_segs:
                        if ns in segs:
                            pali_page_counts[pg] = pali_page_counts.get(pg, 0) + 1
                            break
                if pali_page_counts:
                    target_pali_page = max(pali_page_counts.items(), key=lambda x: (x[1], x[0]))[0]
                else:
                    # No page contains any listed paragraph: fall back to the
                    # first page whose paranum contains the first number
                    # (same search, over the rows already fetched — no extra
                    # round-trip, no LIKE).
                    ns0 = str(nums[0])
                    for pg, segs in row_segs:
                        if ns0 in segs:
                            target_pali_page = pg
                            break
            pb = p_cur.execute("SELECT name FROM books WHERE id = ?", (p_bid,)).fetchone()
            if pb:
                matching_pali = {"book_id": p_bid, "book_name": pb[0], "page": target_pali_page, "paragraphs": nums}

    content_html = page_row[0] if page_row else "<p>ဤစာမျက်နှာအတွက် အချက်အလက်မရှိပါ။</p>"
    if content_html:
        content_html = _cached_format_mm(content_html)

    return jsonify({
        "book_id": book_id,
        "book_name": book["name"],
        "page": page_num,
        "first_page": book["first_page"],
        "last_page": book["last_page"],
        "page_count": book["number_of_pages"],
        "has_prev": page_num > book["first_page"],
        "has_next": page_num < book["last_page"],
        "prev_page": page_num - 1 if page_num > book["first_page"] else None,
        "next_page": page_num + 1 if page_num < book["last_page"] else None,
        "chapter_name": current_toc[0] if current_toc else "",
        "content": content_html,
        "matching_pali": matching_pali
    })

# ----------------- Paragraph Match API (Split View Sync) -----------------

def find_nearest_pali_para_page(pali_cur, book_id, para_num):
    """Closest *marked* paragraph page inside a Pali book.

    Aṭṭhakathā/Ṭīkā volumes only print a paragraph number at selected
    boundaries (e.g. `attha_vi_01_02` jumps straight from para 233 to 424), so
    an exact `paranum` lookup usually misses for commentary pages. Return the
    latest page whose paragraph range contains the greatest marked paragraph
    <= para_num; when the request precedes the book's first mark, fall back to
    that first mark. Returns (page, matched_para) or (None, None).
    """
    rows = pali_cur.execute(
        "SELECT page, paranum FROM pages WHERE book_id = ? AND paranum IS NOT NULL AND paranum != '' ORDER BY page",
        (book_id,)
    ).fetchall()

    best_para = None
    best_page = None
    first_para = None
    first_page = None
    for r in rows:
        page = r["page"]
        for token in str(r["paranum"]).replace("-", " ").split():
            if not token.isdigit():
                continue
            num = int(token)
            if first_para is None or num < first_para:
                first_para, first_page = num, page
            if num <= para_num and (best_para is None or num > best_para):
                best_para, best_page = num, page

    if best_page is not None:
        return best_page, best_para
    if first_page is not None:
        return first_page, first_para
    return None, None

@app.route("/api/match/para_to_page")
def api_match_para_to_page():
    pali_book_id = request.args.get("pali_book_id", "")
    mm_book_id = request.args.get("mm_book_id", "")
    para_num = request.args.get("para", type=int)

    if para_num is None:
        return jsonify({"error": "para required"}), 400

    result = {"para": para_num}

    # 1. Lookup in Myanmar DB
    if _db_available("mm", DB_MM_PATH):
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        target_mm_id = mm_book_id
        if not target_mm_id and pali_book_id:
            src = m_cur.execute("SELECT mm_book_id FROM source_book WHERE pali_book_id = ?", (pali_book_id,)).fetchone()
            if src:
                target_mm_id = src[0]
        if target_mm_id:
            mp = m_cur.execute("SELECT page_number FROM paragraphs WHERE book_id = ? AND paragraph_number = ?", (target_mm_id, para_num)).fetchone()
            if mp:
                result["mm_book_id"] = target_mm_id
                result["mm_page"] = mp[0]
            else:
                # Translations occasionally skip a paragraph number; land on the
                # paragraph just before it so the jump still moves the pane.
                near = m_cur.execute(
                    "SELECT paragraph_number, page_number FROM paragraphs WHERE book_id = ? AND paragraph_number <= ? ORDER BY paragraph_number DESC LIMIT 1",
                    (target_mm_id, para_num)
                ).fetchone()
                if not near:
                    near = m_cur.execute(
                        "SELECT paragraph_number, page_number FROM paragraphs WHERE book_id = ? AND paragraph_number > ? ORDER BY paragraph_number ASC LIMIT 1",
                        (target_mm_id, para_num)
                    ).fetchone()
                if near:
                    result["mm_book_id"] = target_mm_id
                    result["mm_page"] = near[1]
                    result["mm_para"] = near[0]
                    result["approximate"] = True

    # 2. Lookup in Pali DB
    if _db_available("pali", DB_PALI_PATH):
        p_conn = get_pali_db()
        p_cur = p_conn.cursor()
        target_pali_id = pali_book_id
        if not target_pali_id and mm_book_id and _db_available("mm", DB_MM_PATH):
            m_conn = get_mm_db()
            m_cur = m_conn.cursor()
            src = m_cur.execute("SELECT pali_book_id FROM source_book WHERE mm_book_id = ?", (mm_book_id,)).fetchone()
            if src:
                target_pali_id = src[0]
        if target_pali_id:
            p_page = p_cur.execute("SELECT page FROM pages WHERE book_id = ? AND paranum LIKE ? LIMIT 1", (target_pali_id, f"%-{para_num}-%")).fetchone()
            if p_page:
                result["pali_book_id"] = target_pali_id
                result["pali_page"] = p_page[0]
                result["matched_para"] = para_num
            else:
                near_page, near_para = find_nearest_pali_para_page(p_cur, target_pali_id, para_num)
                if near_page is not None:
                    result["pali_book_id"] = target_pali_id
                    result["pali_page"] = near_page
                    result["matched_para"] = near_para
                    result["approximate"] = True

    return jsonify(result)

@app.route("/api/match/pali_to_companion")
def api_match_pali_to_companion():
    source_book = request.args.get("source_book", "").strip()
    source_page = request.args.get("source_page", type=int)
    target_type = request.args.get("target_type", "pali").strip()
    target_book = request.args.get("target_book", "").strip()
    target_books_raw = request.args.get("target_books", "").strip()

    candidate_targets = []
    if target_books_raw:
        candidate_targets = [b.strip() for b in target_books_raw.split(",") if b.strip()]
    elif target_book:
        candidate_targets = [target_book]

    if not source_book or not source_page:
        return jsonify({"error": "Missing source_book or source_page"}), 400

    m_conn = get_mm_db() if _db_available("mm", DB_MM_PATH) else None
    p_conn = get_pali_db() if _db_available("pali", DB_PALI_PATH) else None

    # 1. Detect if source_book is Myanmar
    is_source_mm = False
    base_pali_id = source_book
    source_paras = []

    if m_conn:
        m_cur = m_conn.cursor()
        src_mm = m_cur.execute("SELECT pali_book_id FROM source_book WHERE mm_book_id = ?", (source_book,)).fetchone()
        if src_mm:
            is_source_mm = True
            base_pali_id = src_mm[0]
            # Extract paragraph numbers from Myanmar page
            p_rows = m_cur.execute("SELECT paragraph_number FROM paragraphs WHERE book_id = ? AND page_number = ?", (source_book, source_page)).fetchall()
            source_paras = [r[0] for r in p_rows if r[0]]

    # If source is Pali (Mūla, Aṭṭhakathā, or Ṭīkā)
    if not is_source_mm and p_conn:
        p_cur = p_conn.cursor()
        # Find base Mūla Pali book ID if source is an Atthakatha or Tika.
        # pali_attha_tika_match stores both direct links (mula -> attha/tika) and
        # 2-hop links (attha -> tika), so prefer a row whose base is genuinely a
        # Mūla volume — otherwise a Ṭīkā source resolves to an Aṭṭhakathā base
        # and every companion lookup (pali/attha/tika) lands on the wrong book.
        base_match = p_cur.execute("""
            SELECT m.base FROM pali_attha_tika_match m
            JOIN books b ON b.id = m.base
            WHERE m.exp = ? AND b.basket = 'mula'
            LIMIT 1
        """, (source_book,)).fetchone()
        if not base_match:
            base_match = p_cur.execute("SELECT base FROM pali_attha_tika_match WHERE exp = ? LIMIT 1", (source_book,)).fetchone()
        if base_match:
            base_pali_id = base_match[0]

        # Extract paragraph numbers from Pali page
        page_row = p_cur.execute("SELECT paranum, content FROM pages WHERE book_id = ? AND page = ?", (source_book, source_page)).fetchone()
        if page_row and page_row["paranum"]:
            source_paras = [int(n) for n in str(page_row["paranum"]).strip('-').split('-') if n.isdigit()]
        if not source_paras and page_row and page_row["content"]:
            found = re.findall(r'para(\d+)', page_row["content"])
            source_paras = [int(n) for n in found if n.isdigit()]

    # 2. Resolve Candidate Targets if not explicitly passed
    if not candidate_targets:
        if target_type == "mm":
            if m_conn:
                src = m_conn.cursor().execute("SELECT mm_book_id FROM source_book WHERE pali_book_id = ?", (base_pali_id,)).fetchone()
                if src:
                    candidate_targets = [src[0]]
                elif p_conn:
                    p_matches = p_conn.cursor().execute("SELECT base, exp FROM pali_attha_tika_match WHERE base = ? OR exp = ?", (base_pali_id, base_pali_id)).fetchall()
                    for r in p_matches:
                        oth = r[1] if r[0] == base_pali_id else r[0]
                        src2 = m_conn.cursor().execute("SELECT mm_book_id FROM source_book WHERE pali_book_id = ?", (oth,)).fetchone()
                        if src2:
                            candidate_targets = [src2[0]]
                            break
        elif target_type == "pali":
            candidate_targets = [base_pali_id]
        elif target_type == "attha" and p_conn:
            rows = p_conn.cursor().execute("SELECT exp FROM pali_attha_tika_match WHERE base = ? AND exp LIKE 'attha_%'", (base_pali_id,)).fetchall()
            candidate_targets = [r[0] for r in rows]
        elif target_type == "tika" and p_conn:
            rows = p_conn.cursor().execute("SELECT exp FROM pali_attha_tika_match WHERE base = ? AND exp LIKE 'tika_%'", (base_pali_id,)).fetchall()
            candidate_targets = [r[0] for r in rows]

    if not candidate_targets:
        def_target = base_pali_id if target_type == "pali" else source_book
        return jsonify({"matched": False, "target_book": def_target, "target_page": 1})

    # 3. Target: Myanmar Translation
    if target_type == "mm":
        mm_bid = candidate_targets[0]
        if not m_conn:
            return jsonify({"matched": False, "target_book": mm_bid, "target_page": 1})
        m_cur = m_conn.cursor()

        # Try direct page map first if source is Pali
        if not is_source_mm:
            pmap = m_cur.execute("""
                SELECT mm_page_number FROM mm_pali_page_map 
                WHERE pali_book_id = ? AND pali_page_number = ? AND mm_book_id = ?
            """, (source_book, source_page, mm_bid)).fetchone()
            if pmap:
                return jsonify({"matched": True, "target_book": mm_bid, "target_page": pmap[0]})

        if source_paras:
            for num in source_paras:
                mp = m_cur.execute("SELECT page_number FROM paragraphs WHERE book_id = ? AND paragraph_number = ?", (mm_bid, num)).fetchone()
                if mp:
                    return jsonify({"matched": True, "target_book": mm_bid, "target_page": mp[0], "matched_para": num})

        # Preceding paragraphs fallback for MM
        if not is_source_mm and p_conn:
            prev_row = p_conn.cursor().execute("SELECT paranum FROM pages WHERE book_id = ? AND page < ? AND paranum != '' ORDER BY page DESC LIMIT 1", (source_book, source_page)).fetchone()
            if prev_row:
                p_nums = [int(n) for n in str(prev_row["paranum"]).strip('-').split('-') if n.isdigit()]
                for num in reversed(p_nums):
                    mp = m_cur.execute("SELECT page_number FROM paragraphs WHERE book_id = ? AND paragraph_number = ?", (mm_bid, num)).fetchone()
                    if mp:
                        return jsonify({"matched": True, "target_book": mm_bid, "target_page": mp[0], "matched_para": num})

        return jsonify({"matched": False, "target_book": mm_bid, "target_page": 1})

    # 4. Target: Pali (Mūla, Aṭṭhakathā, or Ṭīkā)
    else:
        if not p_conn:
            def_bid = candidate_targets[0]
            return jsonify({"matched": False, "target_book": def_bid, "target_page": 1})
        p_cur = p_conn.cursor()

        # If source is MM and target is Pali mula, check direct page map
        if is_source_mm and target_type == "pali" and m_conn:
            pmap = m_conn.cursor().execute("""
                SELECT pali_book_id, pali_page_number FROM mm_pali_page_map
                WHERE mm_book_id = ? AND mm_page_number = ?
            """, (source_book, source_page)).fetchone()
            if pmap and pmap[0] in candidate_targets:
                return jsonify({"matched": True, "target_book": pmap[0], "target_page": pmap[1]})

        # Invert to para-number -> earliest page lookups per candidate book:
        # the previous nested list scans were O(paragraphs x pages) per request.
        target_para_map = {}
        for t_bid in candidate_targets:
            rows = p_cur.execute(
                "SELECT page, paranum FROM pages WHERE book_id = ? AND paranum != '' AND paranum IS NOT NULL",
                (t_bid,)
            ).fetchall()
            pmap = {}
            for r in rows:
                pg = r["page"]
                for n in str(r["paranum"]).strip('-').split('-'):
                    if n.isdigit():
                        num = int(n)
                        old = pmap.get(num)
                        if old is None or pg < old:
                            pmap[num] = pg
            target_para_map[t_bid] = pmap

        if source_paras:
            for t_bid in candidate_targets:
                pmap = target_para_map.get(t_bid, {})
                for num in source_paras:
                    pg = pmap.get(num)
                    if pg is not None:
                        return jsonify({"matched": True, "target_book": t_bid, "target_page": pg, "matched_para": num})

        # Preceding paragraphs fallback
        if not is_source_mm:
            prev_row = p_cur.execute("SELECT paranum FROM pages WHERE book_id = ? AND page < ? AND paranum != '' ORDER BY page DESC LIMIT 1", (source_book, source_page)).fetchone()
            if prev_row:
                prev_nums = [int(n) for n in str(prev_row["paranum"]).strip('-').split('-') if n.isdigit()]
                if prev_nums:
                    for num in range(prev_nums[-1], 0, -1):
                        for t_bid in candidate_targets:
                            pg = target_para_map.get(t_bid, {}).get(num)
                            if pg is not None:
                                return jsonify({"matched": True, "target_book": t_bid, "target_page": pg, "matched_para": num})

        def_bid = candidate_targets[0]
        b = p_cur.execute("SELECT firstpage FROM books WHERE id = ?", (def_bid,)).fetchone()
        first_pg = b["firstpage"] if b else 1
        return jsonify({"matched": False, "target_book": def_bid, "target_page": first_pg})

# ----------------- Dictionary APIs with In-Memory LRU Cache -----------------

def get_pali_stem_candidates(clean):
    """Generate prioritized dictionary lookup candidates: exact -> enclitics -> declension rules -> suffixes."""
    candidates = [clean]

    def add_cand(w, force=False):
        # force=True: explicit closed-class lexical mappings (e.g. pronoun
        # lemmas တ/ယ/က) may be single characters; heuristic stripping stays >= 2
        if w and (len(w) >= 2 or force) and w not in candidates:
            candidates.append(w)

    # Step 1: Enclitic / Sandhi stripping (-န္တိ, -တိ, -ပိ, -ဉ္စ, -ဝါ, -ခေါ, -ေဝ, -ေယဝ, -ယေဝ)
    enclitics = ('န္တိ', 'တိ', 'ပိ', 'ဉ္စ', 'ဝါ', 'ခေါ', 'ေဝ', 'ေယဝ', 'ယေဝ')
    base_words = [clean]
    for enc in enclitics:
        if clean.endswith(enc) and len(clean) > len(enc) + 1:
            base = clean[:-len(enc)]
            add_cand(base)
            base_words.append(base)
            if enc in ('န္တိ', 'ဉ္စ'):
                add_cand(base + 'ံ')

    # Step 2: Pali Declension Rules (နာမ်ဝိဘတ်ဆင်ပုံ စည်းမျဉ်းများ)
    for b in list(base_words):
        # A. -vant / -mant (ဘဂဝတော -> ဘဂဝါ / ဘဂဝန္တ, အာယသ္မတော -> အာယသ္မာ / အာယသ္မန္တ)
        if b.endswith('ဝတော') and len(b) > 4:
            stem = b[:-4]
            add_cand(stem + 'ဝါ')
            add_cand(stem + 'ဝန္တ')
            add_cand(stem + 'ဝ')
        elif b.endswith('ဝတာ') and len(b) > 4:
            stem = b[:-4]
            add_cand(stem + 'ဝါ')
            add_cand(stem + 'ဝန္တ')
        elif b.endswith('မတော') and len(b) > 4:
            stem = b[:-4]
            add_cand(stem + 'မာ')
            add_cand(stem + 'မန္တ')
            add_cand(stem + 'မ')
        elif b.endswith('မတာ') and len(b) > 4:
            stem = b[:-4]
            add_cand(stem + 'မာ')
            add_cand(stem + 'မန္တ')

        # B. Special NT & Araha / Maha (အရဟတော, မဟတော, participles, ablative -တော)
        if b in ('အရဟတော', 'အရဟတံ', 'အရဟတေ'):
            add_cand('အရဟန္တ')
            add_cand('အရဟံ')
            add_cand('အရဟ')
            add_cand('အရဟာ')
        elif b in ('မဟတော', 'မဟတာ', 'မဟတံ', 'မဟတေ'):
            add_cand('မဟန္တ')
            add_cand('မဟာ')
            add_cand('မဟ')
        elif b.endswith('တော') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem)
            add_cand(stem + 'န္တ')
            add_cand(stem + 'ံ')
            add_cand(stem + 'ာ')
        elif b.endswith('တာ') and len(b) > 2:
            stem = b[:-2]
            add_cand(stem)
            add_cand(stem + 'န္တ')
            add_cand(stem + 'ံ')

        # C. Kinship & Agent nouns in -u / -ar (သတ္ထုနော, သတ္ထာရံ -> သတ္ထု, သတ္ထာ; ပိတရော, ပိတုနော -> ပိတု; မာတရော, မာတုနော -> မာတု)
        for suff in ('ာရော', 'ာရံ', 'ာရာ', 'ုနော', 'ရော', 'ရံ'):
            if b.endswith(suff) and len(b) > len(suff) + 1:
                stem = b[:-len(suff)]
                add_cand(stem + 'ု')
                add_cand(stem + 'ာ')

        # D. Consonant stems (ဗြဟ္မာ, ဗြဟ္မ, အတ္တာ, အတ္တ)
        if b.startswith('ဗြဟ္မ') or b.startswith('ဗြဟ္မာ'):
            add_cand('ဗြဟ္မာ')
            add_cand('ဗြဟ္မ')
        if b in ('အတ္တနော', 'အတ္တနာ', 'အတ္တနိ', 'အတ္တာနံ'):
            add_cand('အတ္တာ')
            add_cand('အတ္တ')

        # E. -u / -ū masc/neut (ဘိက္ခဝေ -> ဘိက္ခု, ဘိက္ခူနံ -> ဘိက္ခု, ဘိက္ခုနာ -> ဘိက္ခု)
        if b.endswith('ဝေ') and len(b) > 2:
            stem = b[:-2]
            add_cand(stem + 'ု')
        if b.endswith('ူနံ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')
            add_cand(stem + 'ူ')
        if b.endswith('ုနာ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')
        if b.endswith('ူဟိ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')
            add_cand(stem + 'ူ')
        if b.endswith('ူသု') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')
            add_cand(stem + 'ူ')
        if b.endswith('ဝေါ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')

        # F. Raja forms (ရာညော, ရညော, ရာဇာနော -> ရာဇာ, ရာဇ)
        if b in ('ရာညော', 'ရညော', 'ရာဇာနော', 'ရာဇိနော'):
            add_cand('ရာဇာ')
            add_cand('ရာဇ')

        # G. Feminine -i / -ī and -u / -ū (ဒေဝိယာ -> ဒေဝီ, ဝဓုယာ -> ဝဓူ, ယာဂုယာ -> ယာဂု)
        if b.endswith('ိယာ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ီ')
            add_cand(stem + 'ိ')
        if b.endswith('ိယော') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ီ')
            add_cand(stem + 'ိ')
        if b.endswith('ုယာ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem + 'ု')
            add_cand(stem + 'ူ')

        # H. Pronominal plural (-ေသံ, -ေသာနံ, -ာသံ) e.g. သဗ္ဗေသံ -> သဗ္ဗ
        if b.endswith('ေသံ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem)
        if b.endswith('ေသာနံ') and len(b) > 5:
            stem = b[:-5]
            add_cand(stem)
        if b.endswith('ာသံ') and len(b) > 3:
            stem = b[:-3]
            add_cand(stem)
            add_cand(stem + 'ာ')

        # I. Common pronouns & absolutive roots
        prons = {
            'မေ': ['အဟံ'], 'မယာ': ['အဟံ'], 'မမ': ['အဟံ'], 'မယှံ': ['အဟံ'],
            'တေ': ['တွံ', 'တ'], 'တယာ': ['တွံ'], 'တုယှံ': ['တွံ'], 'တဝ': ['တွံ'],
            'နော': ['အမှ'], 'ဝေါ': ['တုမှ'],
            'ဉာတွာ': ['ဇာနာတိ', 'ဉာ']
        }
        if b in prons:
            for p in prons[b]:
                add_cand(p, force=len(p) < 2)
        if b in ('တဿ', 'တဿာ', 'တေသံ', 'တာသံ', 'တသ္မိံ', 'တမှိ', 'တသ္မာ', 'တေဟိ', 'တာဟိ', 'တေန', 'တာယ'):
            add_cand('တ', force=True)
        if b in ('ယဿ', 'ယဿာ', 'ယေသံ', 'ယာသံ', 'ယသ္မိံ', 'ယမှိ', 'ယသ္မာ', 'ယေဟိ', 'ယာဟိ', 'ယေန', 'ယာယ'):
            add_cand('ယ', force=True)
        if b in ('ကဿ', 'ကဿာ', 'ကေသံ', 'ကာသံ', 'ကသ္မိံ', 'ကမှိ', 'ကသ္မာ', 'ကေဟိ', 'ကာဟိ', 'ကေန', 'ကာယ'):
            add_cand('ကိံ')
            add_cand('က', force=True)

    # Step 3: Generic Suffixes
    for b in list(base_words):
        for s in PALI_SUFFIXES:
            if b.endswith(s) and len(b) > len(s):
                stem = b[:-len(s)]
                add_cand(stem)

    return candidates

@lru_cache(maxsize=16384)
def _cached_pali_dict_lookup(clean):
    """Zero-I/O memoized lookup for recurring Pali words with morphological stemmer."""
    if turso_enabled("pali"):
        conn = connect_turso("pali")
    else:
        conn = sqlite3.connect(DB_PALI_RO_URI, uri=True, check_same_thread=False)
        conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()

        candidates = get_pali_stem_candidates(clean)

        results = []
        matched_word = clean

        for cand in candidates:
            rows = cur.execute("""
                SELECT d.word, d.definition, b.id as book_id, b.name as book_name
                FROM dictionary d
                JOIN dictionary_books b ON d.book_id = b.id
                WHERE d.word = ?
                ORDER BY b.user_order ASC
            """, (cand,)).fetchall()
            if rows:
                matched_word = cand
                results = tuple(dict(r) for r in rows)
                break

        if not results and len(clean) >= 2:
            rows = cur.execute("""
                SELECT d.word, d.definition, b.id as book_id, b.name as book_name
                FROM dictionary d
                JOIN dictionary_books b ON d.book_id = b.id
                WHERE d.word LIKE ?
                ORDER BY b.user_order ASC LIMIT 10
            """, (clean + "%",)).fetchall()
            if rows:
                matched_word = rows[0]["word"]
                results = tuple(dict(r) for r in rows)

        return matched_word, results
    finally:
        # Never leak the connection if a query raises (e.g. DB replaced
        # mid-command); the lru_cache keeps results, not errors.
        conn.close()

@app.route("/api/dictionary/lookup")
def api_dict_lookup():
    raw_word = request.args.get("word", "").strip()
    if not raw_word:
        return jsonify({"word": "", "results": []})

    clean = clean_pali_word(raw_word)
    if not clean:
        return jsonify({"word": raw_word, "results": []})

    matched_word, results = _cached_pali_dict_lookup(clean)

    return jsonify({
        "query": raw_word,
        "clean_word": clean,
        "matched_word": matched_word,
        "results": list(results)
    })

# ----------------- Search API -----------------

def search_pali_phrase(cur, query, page=1, limit=20):
    raw_tokens = query.strip().split()
    clean_tokens = [clean_pali_word(t) for t in raw_tokens]
    clean_tokens = [t for t in clean_tokens if t]
    if not clean_tokens:
        return {"type": "phrase", "query": query, "total": 0, "page": page, "results": []}

    sets = []
    for w in clean_tokens:
        exact = cur.execute("SELECT word, rowids, count FROM wordlist WHERE word = ?", (w,)).fetchone()
        w_pids = set()
        count = exact["count"] if exact else 0
        # Prefix expansion (capped at 20) for rare tokens (<= 2000) or missing entries
        # to ensure full recall across attached quotes and suffixes (e.g. ပဒါလိတာ''တိ -> ပဒါလိတာတိ)
        if count <= 2000:
            prefix_rows = cur.execute(
                "SELECT word, rowids FROM wordlist WHERE word LIKE ? ORDER BY count DESC LIMIT 20",
                (w + "%",)
            ).fetchall()
            for pr in prefix_rows:
                rowids_str = pr["rowids"] or ""
                for tok in rowids_str.split(","):
                    tok = tok.strip()
                    if tok:
                        w_pids.add(tok.split("_")[0])
        elif exact and exact["rowids"]:
            rowids_str = exact["rowids"] or ""
            for tok in rowids_str.split(","):
                tok = tok.strip()
                if tok:
                    w_pids.add(tok.split("_")[0])
        sets.append(w_pids)

    sets.sort(key=len)
    candidate_pids = sets[0].intersection(*sets[1:]) if sets else set()
    if not candidate_pids:
        return {"type": "phrase", "query": query, "total": 0, "page": page, "results": []}

    regex_pattern = re.compile(
        r"[\s,၊။\-—–\"'‘’“”]*?".join(re.escape(t) for t in clean_tokens),
        re.UNICODE
    )

    candidate_list = list(candidate_pids)
    matching_pages = []
    chunk_size = 900
    for i in range(0, len(candidate_list), chunk_size):
        chunk = candidate_list[i:i + chunk_size]
        placeholders = ",".join(["?"] * len(chunk))
        rows = cur.execute(f"""
            SELECT p.id, p.book_id, b.name as book_name, p.page, p.content, b.rowid as book_order
            FROM pages p
            JOIN books b ON p.book_id = b.id
            WHERE p.id IN ({placeholders})
        """, chunk).fetchall()

        for p in rows:
            content = p["content"] or ""
            clean_text = re.sub(r"<[^>]+>", " ", content)
            clean_text = " ".join(clean_text.split())

            m = regex_pattern.search(clean_text)
            if m:
                pos = m.start()
                match_len = m.end() - m.start()
                start = max(0, pos - 60)
                end = min(len(clean_text), pos + match_len + 90)
                snippet = ("..." if start > 0 else "") + clean_text[start:end] + ("..." if end < len(clean_text) else "")
                matching_pages.append({
                    "page_id": p["id"],
                    "book_id": p["book_id"],
                    "book_name": p["book_name"],
                    "page": p["page"],
                    "book_order": p["book_order"],
                    "snippet": snippet
                })

    # Sort strictly by canonical book order (mula -> attha -> tika -> annya) and page number
    matching_pages.sort(key=lambda x: (x["book_order"], x["page"]))
    for m in matching_pages:
        m.pop("book_order", None)
    total = len(matching_pages)
    offset = (page - 1) * limit
    results = matching_pages[offset:offset + limit]

    return {
        "type": "phrase",
        "query": query,
        "total": total,
        "page": page,
        "results": results
    }

def _escape_like(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_mm_phrase(conn, query, page=1, limit=20):
    clean_q = query.strip()
    if not clean_q:
        return {"type": "mm_phrase", "query": query, "total": 0, "page": page, "results": []}

    cur = conn.cursor()
    like_pattern = f"%{_escape_like(clean_q)}%"
    offset = (page - 1) * limit

    total = cur.execute("""
        SELECT count(*)
        FROM mm_pages p
        WHERE p.content LIKE ? ESCAPE '\\'
    """, (like_pattern,)).fetchone()[0]

    rows = cur.execute("""
        SELECT p.book_id, b.name as book_name, p.page, p.content
        FROM mm_pages p
        JOIN book b ON p.book_id = b.id
        WHERE p.content LIKE ? ESCAPE '\\'
        LIMIT ? OFFSET ?
    """, (like_pattern, limit, offset)).fetchall()

    results = []
    for r in rows:
        content = r["content"] or ""
        clean_text = re.sub(r"<[^>]+>", " ", content)
        clean_text = " ".join(clean_text.split())
        pos = clean_text.find(clean_q)
        if pos != -1:
            start = max(0, pos - 60)
            end = min(len(clean_text), pos + len(clean_q) + 90)
            snippet = ("..." if start > 0 else "") + clean_text[start:end] + ("..." if end < len(clean_text) else "")
        else:
            snippet = clean_text[:140] + "..."
        results.append({
            "book_id": r["book_id"],
            "book_name": r["book_name"],
            "page": r["page"],
            "snippet": snippet
        })

    return {
        "type": "mm_phrase",
        "query": query,
        "total": total,
        "page": page,
        "results": results
    }

@app.route("/api/search")
def api_search():
    # Rate limit: search is the most expensive public endpoint (SQLite FTS per
    # query); /api/export and /api/sync/* already have limits. 120/5min is
    # generous for real readers, stops single-IP hammering (see Wikimedia
    # 2026-10-05 rogue-agent report: millions of automated API requests).
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    if not _rate_ok(ip, limit=120, window=300):
        return jsonify({"error": "too many searches, try again later"}), 429
    query = request.args.get("q", "").strip()
    stype = request.args.get("type", "word")
    try:
        page = int(request.args.get("p", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(request.args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    # Clamp: garbage/negative page and huge limits used to 500 or dump the DB
    page = max(1, page)
    limit = min(max(1, limit), 100)
    offset = (page - 1) * limit

    if not query:
        return jsonify({"results": [], "total": 0})

    if stype == "phrase":
        conn = get_pali_db()
        cur = conn.cursor()
        return jsonify(search_pali_phrase(cur, query, page=page, limit=limit))

    elif stype == "mm_phrase":
        if not _db_available("mm", DB_MM_PATH):
            return jsonify({"results": [], "total": 0})
        m_conn = get_mm_db()
        return jsonify(search_mm_phrase(m_conn, query, page=page, limit=limit))

    elif stype == "mm_book":
        # Search Myanmar translated books
        if not _db_available("mm", DB_MM_PATH):
            return jsonify({"results": [], "total": 0})
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        rows = m_cur.execute("""
            SELECT b.id, b.name, c.name as category_name, b.first_page, b.last_page, b.number_of_pages as page_count
            FROM book b
            JOIN category c ON b.category_id = c.id
            WHERE b.name LIKE ?
            LIMIT 50
        """, (f"%{query}%",)).fetchall()
        return jsonify({
            "type": "mm_book",
            "query": query,
            "total": len(rows),
            "results": [dict(r) for r in rows]
        })

    elif stype == "mm_toc":
        # Search Myanmar TOC
        if not _db_available("mm", DB_MM_PATH):
            return jsonify({"results": [], "total": 0})
        m_conn = get_mm_db()
        m_cur = m_conn.cursor()
        total = m_cur.execute("SELECT count(*) FROM toc WHERE name LIKE ?", (f"%{query}%",)).fetchone()[0]
        rows = m_cur.execute("""
            SELECT t.name, t.type, t.page_number, t.book_id, b.name as book_name
            FROM toc t
            JOIN book b ON t.book_id = b.id
            WHERE t.name LIKE ?
            ORDER BY t.book_id, t.page_number
            LIMIT ? OFFSET ?
        """, (f"%{query}%", limit, offset)).fetchall()
        return jsonify({
            "type": "mm_toc",
            "query": query,
            "total": total,
            "page": page,
            "results": [dict(r) for r in rows]
        })

    elif stype == "sutta":
        conn = get_pali_db()
        cur = conn.cursor()
        total = cur.execute("SELECT count(*) FROM suttas WHERE name LIKE ?", (f"%{query}%",)).fetchone()[0]
        rows = cur.execute("""
            SELECT s.name, s.book_id, s.page_number, b.name as book_name, s.sutta_id, s.nikaya
            FROM suttas s
            JOIN books b ON s.book_id = b.id
            WHERE s.name LIKE ?
            ORDER BY s.page_number ASC
            LIMIT ? OFFSET ?
        """, (f"%{query}%", limit, offset)).fetchall()
        return jsonify({
            "type": "sutta",
            "query": query,
            "total": total,
            "page": page,
            "results": [dict(r) for r in rows]
        })

    elif stype == "book":
        conn = get_pali_db()
        cur = conn.cursor()
        rows = cur.execute("""
            SELECT b.id, b.name, b.short_name, b.basket, c.name as category_name, b.firstpage, b.lastpage, b.pagecount
            FROM books b
            LEFT JOIN category c ON b.category = c.id
            WHERE b.name LIKE ? OR b.short_name LIKE ?
            LIMIT 50
        """, (f"%{query}%", f"%{query}%")).fetchall()
        return jsonify({
            "type": "book",
            "query": query,
            "total": len(rows),
            "results": [dict(r) for r in rows]
        })

    elif stype == "toc":
        conn = get_pali_db()
        cur = conn.cursor()
        total = cur.execute("SELECT count(*) FROM tocs WHERE name LIKE ?", (f"%{query}%",)).fetchone()[0]
        rows = cur.execute("""
            SELECT t.name, t.type, t.page_number, t.book_id, b.name as book_name
            FROM tocs t
            JOIN books b ON t.book_id = b.id
            WHERE t.name LIKE ?
            ORDER BY t.book_id, t.page_number
            LIMIT ? OFFSET ?
        """, (f"%{query}%", limit, offset)).fetchall()
        return jsonify({
            "type": "toc",
            "query": query,
            "total": total,
            "page": page,
            "results": [dict(r) for r in rows]
        })

    elif stype == "nissaya":
        n_conn = get_nissaya_db()
        if n_conn is None:
            return jsonify({"type": "nissaya", "query": query, "total": 0, "page": page, "results": []})
        p_conn = get_pali_db()
        book_rows = p_conn.execute("SELECT id, name FROM books").fetchall()
        book_names = {r["id"]: r["name"] for r in book_rows}

        rows = n_conn.execute("""
            SELECT book_id, paragraph_number, page_number, gloss
            FROM nissaya_gloss
            WHERE gloss LIKE ? AND book_id != 'mula_ku_10'
            ORDER BY book_id ASC, page_number ASC, paragraph_number ASC
            LIMIT ? OFFSET ?
        """, (f"%{query}%", limit, offset)).fetchall()

        try:
            total = n_conn.execute(
                "SELECT count(*) FROM nissaya_gloss WHERE gloss LIKE ? AND book_id != 'mula_ku_10'",
                (f"%{query}%",)).fetchone()[0]
        except Exception:
            total = len(rows)

        results = []
        for r in rows:
            b_id = r["book_id"]
            gloss_text = r["gloss"] or ""
            snippet = make_nissaya_snippet(gloss_text, query)
            results.append({
                "book_id": b_id,
                "book_name": book_names.get(b_id, b_id),
                "paragraph_number": r["paragraph_number"],
                "page_number": r["page_number"],
                "snippet": snippet,
                "gloss": gloss_text[:300]
            })

        return jsonify({
            "type": "nissaya",
            "query": query,
            "total": total,
            "page": page,
            "results": results
        })

    else:
        # Word Search
        # Auto-route multi-word queries to phrase search for high-accuracy phrase matching
        tokens = query.strip().split()
        if len(tokens) > 1:
            conn = get_pali_db()
            cur = conn.cursor()
            return jsonify(search_pali_phrase(cur, query, page=page, limit=limit))

        conn = get_pali_db()
        cur = conn.cursor()
        clean_q = clean_pali_word(query)
        word_rows = cur.execute("""
            SELECT word, rowids, count 
            FROM wordlist 
            WHERE word = ?
        """, (clean_q,)).fetchall()

        if not word_rows:
            word_rows = cur.execute("""
                SELECT word, rowids, count 
                FROM wordlist 
                WHERE word LIKE ? 
                ORDER BY count DESC LIMIT 5
            """, (clean_q + "%",)).fetchall()

        if not word_rows:
            return jsonify({"type": "word", "query": query, "total": 0, "results": [], "matched_words": []})

        matched_words = [r["word"] for r in word_rows]
        # Ordered de-dup via dict (O(n)); membership test on a list was O(n²)
        # for common words with tens of thousands of rowid tokens.
        all_page_ids = list(dict.fromkeys(
            tok.split("_")[0]
            for r in word_rows
            for tok in (r["rowids"] or "").split(",")
            if tok.strip()
        ))

        total_occurrences = sum(r["count"] for r in word_rows)
        total_pages = len(all_page_ids)
        slice_ids = all_page_ids[offset:offset + limit]

        results = []
        if slice_ids:
            placeholders = ",".join(["?"] * len(slice_ids))
            pages = cur.execute(f"""
                SELECT p.id, p.book_id, b.name as book_name, p.page, p.content
                FROM pages p
                JOIN books b ON p.book_id = b.id
                WHERE p.id IN ({placeholders})
            """, slice_ids).fetchall()

            page_dict = {str(p["id"]): p for p in pages}
            for pid in slice_ids:
                if pid in page_dict:
                    p = page_dict[pid]
                    clean_text = re.sub(r"<[^>]+>", " ", p["content"])
                    clean_text = " ".join(clean_text.split())
                    pos = clean_text.find(clean_q)
                    if pos != -1:
                        start = max(0, pos - 60)
                        end = min(len(clean_text), pos + len(clean_q) + 90)
                        snippet = ("..." if start > 0 else "") + clean_text[start:end] + ("..." if end < len(clean_text) else "")
                    else:
                        snippet = clean_text[:140] + "..."

                    results.append({
                        "page_id": p["id"],
                        "book_id": p["book_id"],
                        "book_name": p["book_name"],
                        "page": p["page"],
                        "snippet": snippet
                    })

        return jsonify({
            "type": "word",
            "query": query,
            "matched_words": matched_words,
            "total_occurrences": total_occurrences,
            "total": total_pages,
            "page": page,
            "results": results
        })

# ----------------- Bookmarks & Recent -----------------

# ---------------------------------------------------------------------------
# Retired legacy endpoints (2026-09-28)
# /api/bookmarks and /api/recent were GLOBAL shared state: every public visitor
# read/wrote the same rows (anyone could see or delete anyone else's bookmarks
# and reading position). They are replaced by the per-device BookmarkManager /
# HistoryManager with cross-device sync via /api/sync. The underlying tables
# ("bookmark", "recent") are left intact in the DB for manual owner recovery,
# but the HTTP endpoints now refuse all access.
# ---------------------------------------------------------------------------
@app.route("/api/bookmarks", methods=["GET", "POST", "DELETE"])
@app.route("/api/recent", methods=["GET", "POST"])
def api_legacy_retired():
    return jsonify({
        "error": "gone",
        "message": "This endpoint was retired: bookmarks and reading history are now stored per-device and synced via /api/sync.",
    }), 410

# ============================================================
# Annotation Sync — cross-device via pairing code
# A device creates a sync code (e.g. "X7K2-9PQ4"); entering the
# code on another device links it to the same sync account.
# Each device holds its own random secret (stored hashed server-side);
# the short code is only used once for pairing.
# Sync protocol: last-write-wins per annotation id + tombstones.
# ============================================================
SYNC_DB_PATH = os.path.join(BASE_DIR, "sync.db")
_SYNC_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L confusables
_SYNC_COLORS = {"amber", "blue", "green", "red"}
_SYNC_RATE = {}  # ip -> [attempt timestamps] for /api/sync/claim
_SYNC_RATE_LOCK = threading.Lock()


_SYNC_SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_accounts (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_devices (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    secret_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sync_devices_hash ON sync_devices(secret_hash);
CREATE TABLE IF NOT EXISTS sync_annotations (
    account_id INTEGER NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    ann_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, ann_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_ann_updated ON sync_annotations(account_id, updated_at);
CREATE TABLE IF NOT EXISTS sync_history (
    account_id INTEGER NOT NULL REFERENCES sync_accounts(id) ON DELETE CASCADE,
    hist_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'reading',
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, hist_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_hist_updated ON sync_history(account_id, updated_at);
"""
_SYNC_DB_READY = False
_SYNC_DB_LOCK = threading.Lock()


def _sync_conn():
    global _SYNC_DB_READY
    if turso_enabled("sync"):
        # Remote libsql: no local PRAGMAs (WAL/synchronous/foreign_keys are
        # local-file settings); schema init below runs the same for both.
        conn = connect_turso("sync")
    else:
        conn = sqlite3.connect(SYNC_DB_PATH, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
    # Lazy init: ensures tables exist even when the app is run via
    # gunicorn/systemd (where __main__ never executes). Idempotent.
    # Lock-guarded: two threaded first requests racing executescript on the
    # same new DB would otherwise hit "database is locked" and silently
    # skip schema creation.
    if not _SYNC_DB_READY:
        with _SYNC_DB_LOCK:
            if not _SYNC_DB_READY:
                try:
                    conn.executescript(_SYNC_SCHEMA)
                    conn.commit()
                    _SYNC_DB_READY = True
                except Exception as e:
                    # Flag stays False, so the next request retries init,
                    # but log loudly: silent schema failure makes every
                    # later sync endpoint 500 with no trace.
                    print(f"sync DB schema init failed: {e}", file=sys.stderr)
    return conn


def init_sync_db():
    conn = _sync_conn()
    conn.close()


def _new_sync_code():
    return "-".join("".join(secrets.choice(_SYNC_CODE_ALPHABET) for _ in range(4)) for _ in range(2))


def _hash_secret(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _sync_account_by_secret(secret):
    """Return {id, code, device_id} for a valid device secret, else None."""
    if not isinstance(secret, str) or not secret or len(secret) > 128:
        return None
    conn = _sync_conn()
    try:
        row = conn.execute(
            """SELECT a.id AS id, a.code AS code, d.id AS device_id,
                      d.last_seen AS last_seen
               FROM sync_devices d JOIN sync_accounts a ON a.id = d.account_id
               WHERE d.secret_hash = ?""",
            (_hash_secret(secret),)).fetchone()
        if row:
            now = int(time.time())
            # Throttle the write: pulls happen often, last_seen is approximate
            if now - (row["last_seen"] or 0) > 3600:
                conn.execute("UPDATE sync_devices SET last_seen = ? WHERE id = ?",
                             (now, row["device_id"]))
                conn.commit()
            return {"id": row["id"], "code": row["code"], "device_id": row["device_id"]}
        return None
    finally:
        conn.close()


def _rate_ok(ip, limit=10, window=300):
    """In-memory per-IP rate limiter (best-effort; each worker has its own)."""
    now = time.time()
    hits = [t for t in _SYNC_RATE.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        return False
    hits.append(now)
    # Read-modify-write under lock: the threaded WSGI server would otherwise
    # lose concurrent hits and quietly raise the effective limit.
    with _SYNC_RATE_LOCK:
        _SYNC_RATE[ip] = hits
        if len(_SYNC_RATE) > 2000:
            # Evict the 500 least-recently-seen IPs. Never wipe the whole table:
            # wiping would let an attacker reset everyone's limit by flooding
            # the table with fresh IPs.
            victims = sorted(_SYNC_RATE,
                             key=lambda k: _SYNC_RATE[k][-1] if _SYNC_RATE[k] else 0)[:500]
            for v in victims:
                _SYNC_RATE.pop(v, None)
    return True


def _claim_rate_ok(ip):
    return _rate_ok(ip, limit=10, window=300)


def _clean_annotation(a):
    """Whitelist + length-cap a client-supplied annotation. Returns dict or None."""
    if not isinstance(a, dict):
        return None
    ann_id = str(a.get("id", ""))[:64]
    if not ann_id:
        return None
    color = str(a.get("color", "amber"))
    if color not in _SYNC_COLORS:
        color = "amber"
    try:
        page = int(a.get("page", 0))
    except (TypeError, ValueError):
        page = 0
    try:
        updated_at = int(a.get("updatedAt", 0))
    except (TypeError, ValueError):
        updated_at = 0
    if updated_at <= 0:
        updated_at = int(time.time() * 1000)
    try:
        sel_start = max(0, int(a.get("selStart", 0)))
    except (TypeError, ValueError):
        sel_start = 0
    return {
        "id": ann_id,
        "bookId": str(a.get("bookId", ""))[:64],
        "bookName": str(a.get("bookName", ""))[:120],
        "page": page,
        "paraId": str(a.get("paraId", ""))[:32],
        "paraText": str(a.get("paraText", ""))[:200],
        "selText": str(a.get("selText", ""))[:500],
        "selStart": sel_start,
        "color": color,
        "note": str(a.get("note", ""))[:500],
        "updatedAt": updated_at,
        "deleted": 1 if a.get("deleted") else 0,
    }


def _clean_history(h):
    """Whitelist + length-cap a client-supplied history entry. Returns dict or None."""
    if not isinstance(h, dict):
        return None
    hist_id = str(h.get("id", ""))[:64]
    if not hist_id:
        return None
    kind = str(h.get("kind", "reading"))
    if kind not in ("reading", "search", "bookmark"):
        kind = "reading"
    try:
        updated_at = int(h.get("updatedAt", 0))
    except (TypeError, ValueError):
        updated_at = 0
    if updated_at <= 0:
        updated_at = int(time.time() * 1000)
    try:
        timestamp = int(h.get("timestamp", 0))
    except (TypeError, ValueError):
        timestamp = 0
    if timestamp <= 0:
        timestamp = updated_at
    try:
        page = int(h.get("page", 0))
    except (TypeError, ValueError):
        page = 0
    clean = {
        "id": hist_id,
        "kind": kind,
        "updatedAt": updated_at,
        "timestamp": timestamp,
        "deleted": 1 if h.get("deleted") else 0,
    }
    if kind == "reading":
        try:
            split_page = int(h.get("splitMMPage", 0))
        except (TypeError, ValueError):
            split_page = 0
        clean.update({
            "mode": str(h.get("mode", "pali"))[:16],
            "bookId": str(h.get("bookId", ""))[:64],
            "bookName": str(h.get("bookName", ""))[:120],
            "page": page,
            "chapterName": str(h.get("chapterName", ""))[:200],
            "splitMMBookId": str(h.get("splitMMBookId") or "")[:64] or None,
            "splitMMBookName": str(h.get("splitMMBookName") or "")[:120] or None,
            "splitMMPage": split_page or None,
        })
    elif kind == "bookmark":
        clean.update({
            "mode": str(h.get("mode", "pali"))[:16],
            "bookId": str(h.get("bookId", ""))[:64],
            "bookName": str(h.get("bookName", ""))[:120],
            "page": page,
            "note": str(h.get("note", ""))[:500],
        })
    else:
        try:
            rc = h.get("resultCount")
            rc = int(rc) if rc is not None else None
        except (TypeError, ValueError):
            rc = None
        clean.update({
            "query": str(h.get("query", ""))[:200],
            "type": str(h.get("type", "word"))[:16],
            "resultCount": rc,
        })
    return clean


@app.route("/api/sync/create", methods=["POST"])
def api_sync_create():
    """Create a new sync account; returns pairing code + this device's secret."""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    if not _rate_ok(ip, limit=20, window=3600):
        return jsonify({"error": "too many accounts created, try again later"}), 429
    data = request.json or {}
    name = str(data.get("device_name", ""))[:40] or "Device"
    conn = _sync_conn()
    try:
        code = None
        for _ in range(5):
            candidate = _new_sync_code()
            try:
                cur = conn.execute(
                    "INSERT INTO sync_accounts (code, created_at) VALUES (?, ?)",
                    (candidate, int(time.time())))
                code = candidate
                break
            except sqlite3.IntegrityError:
                continue
        if code is None:
            return jsonify({"error": "could not generate code"}), 500
        account_id = cur.lastrowid
        secret = secrets.token_urlsafe(32)
        now = int(time.time())
        conn.execute(
            "INSERT INTO sync_devices (account_id, secret_hash, name, created_at, last_seen)"
            " VALUES (?, ?, ?, ?, ?)",
            (account_id, _hash_secret(secret), name, now, now))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"code": code, "secret": secret})


@app.route("/api/sync/claim", methods=["POST"])
def api_sync_claim():
    """Join an existing sync account with a pairing code; returns this device's secret."""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    if not _claim_rate_ok(ip):
        return jsonify({"error": "too many attempts, try again later"}), 429
    data = request.json or {}
    code = str(data.get("code", "")).upper().replace(" ", "")
    name = str(data.get("device_name", ""))[:40] or "Device"
    if not re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", code):
        return jsonify({"error": "invalid code format"}), 400
    conn = _sync_conn()
    try:
        row = conn.execute("SELECT id FROM sync_accounts WHERE code = ?", (code,)).fetchone()
        if not row:
            return jsonify({"error": "code not found"}), 404
        secret = secrets.token_urlsafe(32)
        now = int(time.time())
        conn.execute(
            "INSERT INTO sync_devices (account_id, secret_hash, name, created_at, last_seen)"
            " VALUES (?, ?, ?, ?, ?)",
            (row["id"], _hash_secret(secret), name, now, now))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"secret": secret, "code": code})


@app.route("/api/sync/push", methods=["POST"])
def api_sync_push():
    """Upload annotations + history entries; last-write-wins per id."""
    data = request.json or {}
    acc = _sync_account_by_secret(data.get("secret"))
    if not acc:
        return jsonify({"error": "unauthorized"}), 401
    anns = data.get("annotations")
    if not isinstance(anns, list) or len(anns) > 5000:
        return jsonify({"error": "invalid annotations"}), 400
    hist = data.get("history")
    if hist is None:
        hist = []
    if not isinstance(hist, list) or len(hist) > 2000:
        return jsonify({"error": "invalid history"}), 400
    conn = _sync_conn()
    try:
        # Conditional upserts: one statement per row, no SELECT round-trip.
        # WHERE excluded.updated_at >= ... keeps last-write-wins semantics.
        ann_rows = []
        for a in anns:
            clean = _clean_annotation(a)
            if not clean:
                continue
            ann_rows.append((acc["id"], clean["id"],
                            json.dumps(clean, ensure_ascii=False),
                            clean["updatedAt"], clean["deleted"]))
        if ann_rows:
            conn.executemany(
                """INSERT INTO sync_annotations (account_id, ann_id, data, updated_at, deleted)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(account_id, ann_id) DO UPDATE SET
                     data = excluded.data, updated_at = excluded.updated_at,
                     deleted = excluded.deleted
                   WHERE excluded.updated_at >= sync_annotations.updated_at""",
                ann_rows)
        hist_rows = []
        for h in hist:
            clean = _clean_history(h)
            if not clean:
                continue
            hist_rows.append((acc["id"], clean["id"], clean["kind"],
                             json.dumps(clean, ensure_ascii=False),
                             clean["updatedAt"], clean["deleted"]))
        if hist_rows:
            conn.executemany(
                """INSERT INTO sync_history (account_id, hist_id, kind, data, updated_at, deleted)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(account_id, hist_id) DO UPDATE SET
                     kind = excluded.kind, data = excluded.data,
                     updated_at = excluded.updated_at, deleted = excluded.deleted
                   WHERE excluded.updated_at >= sync_history.updated_at""",
                hist_rows)
        # Prune tombstones older than 90 days
        cutoff = int(time.time() * 1000) - 90 * 24 * 3600 * 1000
        conn.execute(
            "DELETE FROM sync_annotations WHERE account_id = ? AND deleted = 1 AND updated_at < ?",
            (acc["id"], cutoff))
        conn.execute(
            "DELETE FROM sync_history WHERE account_id = ? AND deleted = 1 AND updated_at < ?",
            (acc["id"], cutoff))
        conn.commit()
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM sync_annotations WHERE account_id = ? AND deleted = 0",
            (acc["id"],)).fetchone()["c"]
        hist_count = conn.execute(
            "SELECT COUNT(*) AS c FROM sync_history WHERE account_id = ? AND deleted = 0",
            (acc["id"],)).fetchone()["c"]
    finally:
        conn.close()
    return jsonify({"ok": True, "count": count, "history_count": hist_count,
                    "server_time": int(time.time() * 1000)})


@app.route("/api/sync/pull", methods=["POST"])
def api_sync_pull():
    """Download annotations + history changed since `since` (ms epoch); includes tombstones."""
    data = request.json or {}
    acc = _sync_account_by_secret(data.get("secret"))
    if not acc:
        return jsonify({"error": "unauthorized"}), 401
    try:
        since = int(data.get("since", 0))
    except (TypeError, ValueError):
        since = 0
    conn = _sync_conn()
    try:
        # Payload cap: an account with a huge history must not produce a
        # multi-MB response on every device poll. Clients already merge
        # incrementally via `since`, so the next pull fills any gap.
        rows = conn.execute(
            "SELECT data FROM sync_annotations WHERE account_id = ? AND updated_at > ? LIMIT 2000",
            (acc["id"], since)).fetchall()
        hist_rows = conn.execute(
            "SELECT data FROM sync_history WHERE account_id = ? AND updated_at > ? LIMIT 2000",
            (acc["id"], since)).fetchall()
    finally:
        conn.close()
    return jsonify({
        "annotations": [json.loads(r["data"]) for r in rows],
        "history": [json.loads(r["data"]) for r in hist_rows],
        "server_time": int(time.time() * 1000),
    })


@app.route("/api/sync/status", methods=["POST"])
def api_sync_status():
    data = request.json or {}
    acc = _sync_account_by_secret(data.get("secret"))
    if not acc:
        return jsonify({"error": "unauthorized"}), 401
    conn = _sync_conn()
    try:
        devices = conn.execute(
            "SELECT COUNT(*) AS c FROM sync_devices WHERE account_id = ?",
            (acc["id"],)).fetchone()["c"]
        anns = conn.execute(
            "SELECT COUNT(*) AS c FROM sync_annotations WHERE account_id = ? AND deleted = 0",
            (acc["id"],)).fetchone()["c"]
        hist = conn.execute(
            "SELECT COUNT(*) AS c FROM sync_history WHERE account_id = ? AND deleted = 0",
            (acc["id"],)).fetchone()["c"]
    finally:
        conn.close()
    return jsonify({"code": acc["code"], "devices": devices, "annotations": anns, "history": hist})


@app.route("/api/sync/leave", methods=["POST"])
def api_sync_leave():
    """Unlink this device from the sync account (account + data stay for other devices)."""
    data = request.json or {}
    acc = _sync_account_by_secret(data.get("secret"))
    if not acc:
        return jsonify({"error": "unauthorized"}), 401
    conn = _sync_conn()
    try:
        conn.execute("DELETE FROM sync_devices WHERE id = ?", (acc["device_id"],))
        conn.commit()
    finally:
        conn.close()
    return jsonify({"ok": True})


def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000")

if __name__ == "__main__":
    port = _env_int("PORT", 5000)
    # Default to 0.0.0.0 so phone, tablet, and LAN devices on the same Wi-Fi
    # can access the reader. Set APP_HOST=127.0.0.1 to restrict to localhost.
    host = os.environ.get("APP_HOST", "0.0.0.0")
    init_sync_db()
    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.2, open_browser).start()
    print(f"==================================================")
    print(f" Tipitaka Pali & Myanmar Web Reader")
    print(f" Server running at: http://127.0.0.1:{port}")
    if host == "0.0.0.0":
        print(f" LAN access: http://<your-ip>:{port}")
    print(f" Press Ctrl+C to stop.")
    print(f"==================================================")
    app.run(host=host, port=port, debug=False)
