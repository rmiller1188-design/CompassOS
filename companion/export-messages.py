#!/usr/bin/env python3
"""Export an Apple Messages sms.db into a Compass-compatible CSV.

This runs locally. It never uploads the database. It intentionally exports
text metadata only; large attachment payloads remain separate.
"""
from __future__ import annotations
import argparse, csv, datetime as dt, pathlib, sqlite3, sys

APPLE_EPOCH = dt.datetime(2001, 1, 1, tzinfo=dt.timezone.utc)

def apple_date(value):
    if value is None:
        return ""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return ""
    # Modern Messages uses nanoseconds from 2001; older stores can use seconds.
    seconds = n / 1_000_000_000 if abs(n) > 10_000_000_000 else n
    try:
        return (APPLE_EPOCH + dt.timedelta(seconds=seconds)).isoformat()
    except OverflowError:
        return ""

def columns(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("database", help="Path to sms.db")
    ap.add_argument("output", nargs="?", default="compass-messages.csv")
    args = ap.parse_args()
    db = pathlib.Path(args.database).expanduser().resolve()
    if not db.is_file():
        sys.exit(f"sms.db not found: {db}")
    uri = f"file:{db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    required = {"message", "handle"}
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not required.issubset(tables):
        sys.exit("This does not look like an Apple Messages sms.db")
    mcols = columns(conn, "message")
    text_expr = "m.text" if "text" in mcols else "NULL"
    service_expr = "m.service" if "service" in mcols else "NULL"
    query = f"""
      SELECT m.ROWID AS message_id, m.date, m.is_from_me,
             {text_expr} AS text, {service_expr} AS service,
             h.id AS handle
      FROM message m
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      ORDER BY m.date ASC
    """
    out = pathlib.Path(args.output).expanduser().resolve()
    count = 0
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["Message Date","Chat Session","Sender ID","Text","Service","Direction","Message ID"])
        w.writeheader()
        for r in conn.execute(query):
            handle = r["handle"] or ""
            from_me = bool(r["is_from_me"])
            w.writerow({
                "Message Date": apple_date(r["date"]),
                "Chat Session": handle,
                "Sender ID": "Me" if from_me else handle,
                "Text": r["text"] or "",
                "Service": r["service"] or "iMessage/SMS",
                "Direction": "outgoing" if from_me else "incoming",
                "Message ID": r["message_id"],
            })
            count += 1
    print(f"Exported {count} message records to {out}")
    print("No message attachment files were copied.")

if __name__ == "__main__":
    main()
