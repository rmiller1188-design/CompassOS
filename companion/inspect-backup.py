#!/usr/bin/env python3
import json, os, plistlib, sqlite3, sys
from pathlib import Path

base = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
if not base:
    latest = Path.home()/"CompassOS/iPhoneBackups/.latest"
    if latest.exists(): base = Path(latest.read_text().strip())
if not base or not base.exists():
    raise SystemExit("Backup folder not found. Pass it as the first argument or create a backup first.")

# idevicebackup2 stores a UDID subfolder beneath the destination.
candidates = [base] + [p for p in base.iterdir() if p.is_dir()]
root = next((p for p in candidates if (p/"Manifest.db").exists()), None)
if not root:
    raise SystemExit("Manifest.db not found. This does not look like a completed Apple backup.")

info = {}
for name in ("Info.plist", "Status.plist", "Manifest.plist"):
    path=root/name
    if path.exists():
        try:
            with path.open("rb") as f: info[name]=plistlib.load(f)
        except Exception: info[name]={"present":True,"readable":False}

conn=sqlite3.connect(f"file:{root/'Manifest.db'}?mode=ro", uri=True)
conn.row_factory=sqlite3.Row
cur=conn.cursor()
queries={
 "messages":["HomeDomain","Library/SMS/sms.db"],
 "contacts":["HomeDomain","Library/AddressBook/AddressBook.sqlitedb"],
 "calls":["WirelessDomain","Library/CallHistoryDB/CallHistory.storedata"],
 "voicemail":["HomeDomain","Library/Voicemail/voicemail.db"],
 "calendar":["HomeDomain","Library/Calendar/Calendar.sqlitedb"],
 "notes":["AppDomainGroup-group.com.apple.notes","NoteStore.sqlite"],
}
found={}
for key,(domain,path) in queries.items():
    rows=cur.execute("SELECT fileID,domain,relativePath,flags FROM Files WHERE domain=? AND relativePath=?",(domain,path)).fetchall()
    found[key]=[dict(r) for r in rows]

# Also count likely media/attachment records without extracting them yet.
attachment_count=cur.execute("SELECT count(*) FROM Files WHERE relativePath LIKE 'Library/SMS/Attachments/%'").fetchone()[0]
voicemail_audio_count=cur.execute("SELECT count(*) FROM Files WHERE relativePath LIKE 'Library/Voicemail/%' AND (relativePath LIKE '%.amr' OR relativePath LIKE '%.m4a' OR relativePath LIKE '%.caf')").fetchone()[0]
conn.close()

summary={
 "backup":str(root),
 "device_name":info.get("Info.plist",{}).get("Device Name"),
 "product_version":info.get("Info.plist",{}).get("Product Version"),
 "datasets":{k:{"available":bool(v),"records":v} for k,v in found.items()},
 "message_attachment_files":attachment_count,
 "voicemail_audio_files":voicemail_audio_count,
}
print(json.dumps(summary,indent=2,default=str))
