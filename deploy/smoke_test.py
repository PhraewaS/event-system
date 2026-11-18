"""Read-only Gather smoke checks adapted from the Lab 5 Starter Kit.

Uses standard-library HTTP only. CI mocks requests; no login, seed or writes.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def request(base, path):
    with urllib.request.urlopen(base + path, timeout=30) as response:
        return response.read()


def check(base):
    parsed = urllib.parse.urlsplit(base)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise RuntimeError("Supply an HTTP(S) service origin without credentials.")
    base = base.rstrip("/")

    def verified(path, predicate):
        for attempt in range(5):
            try:
                body = request(base, path)
                if not predicate(body):
                    raise ValueError("Unexpected response")
                print("PASS " + path)
                return body
            except (urllib.error.URLError, TimeoutError, ValueError, TypeError, AttributeError):
                if attempt == 4:
                    raise RuntimeError("Smoke check failed: " + path) from None
                time.sleep(3)

    verified("/api/health", lambda b: json.loads(b).get("data", {}).get("status") == "ok")
    verified("/api/ready", lambda b: json.loads(b).get("status") == "ready"
             and json.loads(b).get("db") == "connected")
    html = verified("/", lambda b: b'id="root"' in b and
                    re.search(rb'<script[^>]+src="([^"]+)"', b) is not None)
    asset = re.search(rb'<script[^>]+src="([^"]+)"', html).group(1).decode("utf-8")
    target = urllib.parse.urlsplit(urllib.parse.urljoin(base + "/", asset))
    if (target.scheme, target.netloc) != (parsed.scheme, parsed.netloc):
        raise RuntimeError("UI script must use the service origin.")
    verified(target.path, lambda b: len(b) > 0)
    # An empty list is valid; readiness does not require demo seeding.
    verified("/api/events", lambda b: isinstance(json.loads(b).get("data"), list))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 deploy/smoke_test.py SERVICE_URL")
    check(sys.argv[1])
