import base64
import os
import re
from datetime import datetime, timezone

import psycopg
from psycopg import sql
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from dotenv import load_dotenv


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

load_dotenv()


IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _now_utc():
    return datetime.now(timezone.utc)


def _get_db_url(payload_db_url: str | None):
    db_url = (payload_db_url or os.getenv("DATABASE_URL") or "").strip()
    if not db_url:
        raise ValueError("DATABASE_URL is not set and no db_url was provided")
    if not (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        raise ValueError("Invalid Postgres URL")
    return db_url


def _validate_ident(name: str, kind: str):
    if not name or not IDENT_RE.match(name):
        raise ValueError(f"Invalid {kind}")


def _validate_columns(columns: list[str]):
    if not columns or not isinstance(columns, list):
        raise ValueError("columns must be a non-empty list")
    for c in columns:
        _validate_ident(c, "column")


def _parse_iso_datetime(s: str | None):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        raise ValueError("Invalid datetime. Use ISO-8601")


def _connect(db_url: str):
    return psycopg.connect(db_url, autocommit=True)


@app.get("/api/health")
def api_health():
    return jsonify({"ok": True, "ts": _now_utc().isoformat()})


@app.get("/api/render-status")
def api_render_status():
    base = os.getenv("RENDER_API_URL", "").strip()
    if not base:
        return jsonify({"ok": False, "connected": False, "error": "RENDER_API_URL not set"}), 200
    try:
        r = requests.get(base, timeout=5)
        return jsonify({"ok": True, "connected": 200 <= r.status_code < 500, "status": r.status_code})
    except Exception as e:
        return jsonify({"ok": False, "connected": False, "error": str(e)}), 200


@app.post("/api/db-test")
def api_db_test():
    body = request.get_json(silent=True) or {}
    try:
        db_url = _get_db_url(body.get("db_url"))
        with _connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute("select 1")
        return jsonify({"ok": True, "connected": True})
    except Exception as e:
        return jsonify({"ok": True, "connected": False, "error": str(e)})


@app.post("/api/messages/query")
def api_messages_query():
    body = request.get_json(silent=True) or {}

    try:
        db_url = _get_db_url(body.get("db_url"))
        table = (body.get("table") or "messages").strip()
        _validate_ident(table, "table")

        columns = body.get("columns")
        if not isinstance(columns, list) or not columns:
            columns = ["id", "user_identifier", "sender", "admin_name", "message", "file", "created_at"]
        _validate_columns(columns)

        since = _parse_iso_datetime(body.get("since"))
        limit = int(body.get("limit") or 2000)
        limit = max(1, min(limit, 5000))

        with _connect(db_url) as conn:
            with conn.cursor() as cur:
                cols_sql = sql.SQL(",").join(sql.Identifier(c) for c in columns)
                base_q = sql.SQL("select {cols} from {tbl}").format(
                    cols=cols_sql,
                    tbl=sql.Identifier(table),
                )

                if since is not None and "created_at" in columns:
                    q = base_q + sql.SQL(" where {ca} > %s order by {ca} asc limit %s").format(
                        ca=sql.Identifier("created_at")
                    )
                    cur.execute(q, (since, limit))
                else:
                    q = base_q + sql.SQL(" order by {ca} asc limit %s").format(ca=sql.Identifier("created_at"))
                    cur.execute(q, (limit,))

                rows = cur.fetchall()
                results = []
                for row in rows:
                    item = {}
                    for i, c in enumerate(columns):
                        v = row[i]
                        if isinstance(v, (datetime,)):
                            if v.tzinfo is None:
                                v = v.replace(tzinfo=timezone.utc)
                            v = v.astimezone(timezone.utc).isoformat()
                        if isinstance(v, (bytes, bytearray)):
                            item[c] = base64.b64encode(v).decode("utf-8")
                        else:
                            item[c] = v
                    results.append(item)

        return jsonify({"ok": True, "rows": results})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.post("/api/messages/send")
def api_messages_send():
    body = request.get_json(silent=True) or {}

    try:
        db_url = _get_db_url(body.get("db_url"))
        table = (body.get("table") or "messages").strip()
        _validate_ident(table, "table")

        cols = body.get("columns")
        if not isinstance(cols, list) or not cols:
            cols = ["id", "user_identifier", "sender", "admin_name", "message", "file", "created_at"]
        _validate_columns(cols)

        user_identifier = (body.get("user_identifier") or "").strip()
        sender = (body.get("sender") or "admin").strip()
        admin_name = (body.get("admin_name") or "").strip()
        message = (body.get("message") or "").strip()

        if not user_identifier:
            raise ValueError("user_identifier is required")
        if not message and not body.get("file_base64"):
            raise ValueError("message or attachment is required")

        file_bytes = None
        file_b64 = body.get("file_base64")
        if file_b64:
            file_bytes = base64.b64decode(file_b64)
            if len(file_bytes) > 10 * 1024 * 1024:
                raise ValueError("Attachment too large (max 10MB)")

        created_at = body.get("created_at")
        if created_at:
            created_at_dt = _parse_iso_datetime(created_at)
        else:
            created_at_dt = _now_utc()

        payload = {
            "user_identifier": user_identifier,
            "sender": sender,
            "admin_name": admin_name,
            "message": message,
            "file": file_bytes,
            "created_at": created_at_dt,
        }

        insert_cols = []
        insert_vals = []
        for c in cols:
            if c in payload:
                insert_cols.append(sql.Identifier(c))
                insert_vals.append(payload[c])

        if not insert_cols:
            raise ValueError("No insertable columns found. Ensure columns include user_identifier, sender, message, created_at")

        with _connect(db_url) as conn:
            with conn.cursor() as cur:
                q = sql.SQL("insert into {tbl} ({cols}) values ({vals}) returning *").format(
                    tbl=sql.Identifier(table),
                    cols=sql.SQL(",").join(insert_cols),
                    vals=sql.SQL(",").join(sql.Placeholder() for _ in insert_cols),
                )
                cur.execute(q, insert_vals)
                row = cur.fetchone()

        return jsonify({"ok": True, "inserted": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
