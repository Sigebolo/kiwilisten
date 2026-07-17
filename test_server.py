"""Quick uvicorn startup test."""
import sys
sys.path.insert(0, ".")

import uvicorn, threading, time, urllib.request, json

def run():
    uvicorn.run("web.app:app", host="127.0.0.1", port=8001, log_level="warning", reload=False)

t = threading.Thread(target=run, daemon=True)
t.start()
time.sleep(4)

checks = [
    ("GET /",           "http://127.0.0.1:8001/"),
    ("GET /api/articles","http://127.0.0.1:8001/api/articles"),
    ("GET /listen/esl-11379", "http://127.0.0.1:8001/listen/esl-11379"),
    ("GET /api/article/esl-11379", "http://127.0.0.1:8001/api/article/esl-11379"),
]

all_ok = True
for name, url in checks:
    try:
        r = urllib.request.urlopen(url, timeout=5)
        body = r.read()
        print(f"  {name} -> {r.status}  ({len(body)} bytes)")
    except Exception as e:
        print(f"  {name} -> ERROR: {e}")
        all_ok = False

if all_ok:
    print("ALL CHECKS PASSED")
else:
    print("SOME CHECKS FAILED")