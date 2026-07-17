"""Debug test for listen route."""
import sys
sys.path.insert(0, ".")

import uvicorn, threading, time, urllib.request

def run():
    uvicorn.run("web.app:app", host="127.0.0.1", port=8004", log_level="warning", reload=False)

t = threading.Thread(target=run, daemon=True)
t.start()
time.sleep(4)

for url in [
    "http://127.0.0.1:8004/",
    "http://127.0.0.1:8004/listen/esl-11379",
    "http://127.0.0.1:8004/api/article/esl-11379",
]:
    try:
        r = urllib.request.urlopen(url, timeout=5)
        print(f"  {url} -> {r.status}  ({len(r.read())} bytes)")
    except urllib.error.HTTPError as e:
        print(f"  {url} -> {e.code} {e.reason}")
        body = e.read()
        print(f"  Body: {body[:200]}")
    except Exception as e:
        print(f"  {url} -> ERROR: {e}")