"""Debug what name is passed to load_template."""
import sys
sys.path.insert(0, ".")

# Monkey-patch to debug
import jinja2.environment
_orig = jinja2.environment.Environment._load_template
def _patched(self, name, globals=None):
    print(f"[DEBUG] _load_template called with name={repr(name)} type={type(name)}")
    return _orig(self, name, globals)
jinja2.environment.Environment._load_template = _patched

import uvicorn, threading, time, urllib.request

def run():
    uvicorn.run("web.app:app", host="127.0.0.1", port=8003, log_level="info", reload=False)

t = threading.Thread(target=run, daemon=True)
t.start()
time.sleep(4)

try:
    r = urllib.request.urlopen("http://127.0.0.1:8003/", timeout=5)
    print("GET / ->", r.status)
except Exception as e:
    print("ERROR:", e)