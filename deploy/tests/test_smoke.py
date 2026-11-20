"""Offline contract checks for Gather's read-only smoke client."""
import importlib.util
from email.message import Message
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

spec = importlib.util.spec_from_file_location("smoke", Path(__file__).parents[1] / "smoke_test.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def body(self, path):
        return {
            "/api/health": b'{"data":{"status":"ok"}}',
            "/api/ready": b'{"status":"ready","db":"connected"}',
            "/": b'<html><div id="root"></div><script type="module" src="/assets/app.js"></script></html>',
            "/assets/app.js": b'console.log("built application")',
            "/api/events": b'{"data":[]}',
        }[path]

    def response(self, base, path):
        return self.body(path), "text/javascript" if path == "/assets/app.js" else "application/json"

    def broken(self, path, replacement):
        def respond(base, requested):
            return (replacement, "application/json") if requested == path else self.response(base, requested)
        with patch.object(smoke, "request", side_effect=respond), patch.object(smoke.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "Smoke check failed"):
                smoke.check("https://demo.test")

    def test_gather_shapes_empty_events_and_read_only_paths(self):
        with patch.object(smoke, "request", side_effect=self.response) as req:
            smoke.check("https://demo.test")
        self.assertEqual([c.args[1] for c in req.call_args_list],
                         ["/api/health", "/api/ready", "/", "/assets/app.js", "/api/events"])

    def test_db_disconnected_fails_even_with_http_success(self):
        self.broken("/api/ready", b'{"status":"not_ready","db":"disconnected"}')

    def test_old_example_health_shape_is_rejected(self):
        self.broken("/api/health", b'{"status":"ok"}')

    def test_unbuilt_html_is_rejected(self):
        self.broken("/", b"<html>Development placeholder</html>")

    def test_events_error_shape_fails(self):
        self.broken("/api/events", b'{"error":{"code":"DATABASE_UNAVAILABLE"}}')

    def test_external_asset_is_rejected_before_fetch(self):
        def respond(base, path):
            if path == "/":
                return b'<div id="root"></div><script src="https://foreign.test/app.js"></script>', "text/html"
            return self.response(base, path)
        with patch.object(smoke, "request", side_effect=respond) as req:
            with self.assertRaisesRegex(RuntimeError, "service origin"):
                smoke.check("https://demo.test")
        self.assertEqual(req.call_count, 3)

    def test_credentials_are_rejected_before_network(self):
        with patch.object(smoke, "request") as req:
            with self.assertRaisesRegex(RuntimeError, "without credentials"):
                smoke.check("https://user:private@demo.test")
        req.assert_not_called()

    def test_network_failure_has_bounded_attempts(self):
        with patch.object(smoke, "request", side_effect=urllib.error.URLError("offline")) as req, patch.object(smoke.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "/api/health"):
                smoke.check("https://demo.test")
        self.assertEqual(req.call_count, 6, "C-02 merge gate: intentional failure")

    def http_check(self, script_type, script_body):
        def open_response(url, timeout):
            path = url.removeprefix("https://demo.test")
            response = MagicMock()
            response.__enter__.return_value = response
            response.read.return_value = script_body if path == "/assets/app.js" else self.body(path)
            response.headers = Message()
            response.headers["Content-Type"] = script_type if path == "/assets/app.js" else "application/json"
            return response
        with patch.object(smoke.urllib.request, "urlopen", side_effect=open_response), patch.object(smoke.time, "sleep"):
            smoke.check("https://demo.test")

    def test_html_fallback_at_javascript_url_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "/assets/app.js"):
            self.http_check("text/html", b"<!doctype html><html>SPA fallback</html>")

    def test_nonempty_javascript_with_wrong_content_type_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "/assets/app.js"):
            self.http_check("text/plain", b"console.log('wrong MIME type')")

    def test_javascript_mime_types_with_charset_are_accepted(self):
        for content_type in ("text/javascript; charset=utf-8", "application/javascript; charset=UTF-8"):
            with self.subTest(content_type=content_type):
                self.http_check(content_type, b"console.log('built application')")

    def test_empty_javascript_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "/assets/app.js"):
            self.http_check("text/javascript", b"")


if __name__ == "__main__":
    unittest.main()
