"""Test quiz endpoint."""
import sys
sys.path.insert(0, ".")

import uvicorn
import threading
import time
import urllib.request

def run():
    uvicorn.run("web.app:app", host="127.0.0.1", port=8002, log_level="warning", reload=False)

t = threading.Thread(target=run, daemon=True)
t.start()
time.sleep(4)

tests = [
    ("GET /quiz/esl-11379", "http://127.0.0.1:8002/quiz/esl-11379"),
    ("GET /quiz/esl-10837", "http://127.0.0.1:8002/quiz/esl-10837"),
]

all_ok = True
for name, url in tests:
    try:
        r = urllib.request.urlopen(url, timeout=10)
        body = r.read().decode("utf-8")
        ok = "quiz-play" in body and "quiz-options" in body
        print("  %s -> %d  (%d bytes, quiz_elements=%s)" % (name, r.status, len(body), ok))
        if not ok:
            all_ok = False
    except Exception as e:
        print("  %s -> ERROR: %s" % (name, e))
        all_ok = False

if all_ok:
    print("\nALL QUIZ CHECKS PASSED")
else:
    print("\nSOME CHECKS FAILED")
