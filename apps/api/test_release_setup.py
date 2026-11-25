import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from fastapi.testclient import TestClient

from poros_api import config, llm, openai_provider, setup
from poros_api.llm_contracts import LLMProviderError
from poros_api.public_main import app


class ReleaseSetupTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "POROS_LLM_PROVIDER": "openai", "POROS_OPENAI_BASE_URL": "https://example.test/v1",
            "POROS_OPENAI_API_KEY": "private-test-key", "POROS_OPENAI_MODEL": "test-model",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        env_file = patch.object(config, "load_env")
        env_file.start()
        self.addCleanup(env_file.stop)

    def response(self, payload):
        response = MagicMock()
        response.__enter__.return_value = io.StringIO(json.dumps(payload))
        return response

    def test_compatible_request_and_dispatch(self):
        payload = {"choices": [{"message": {"content": '{"ok":true}'}, "finish_reason": "stop"}]}
        with patch.object(openai_provider, "build_opener") as factory:
            factory.return_value.open.return_value = self.response(payload)
            self.assertEqual(llm.request_llm_json("system", "prompt"), {"ok": True})
            args, kwargs = factory.return_value.open.call_args
            self.assertEqual(args[0].full_url, "https://example.test/v1/chat/completions")
            body = json.loads(args[0].data)
            self.assertEqual(body["model"], "test-model")
            self.assertEqual(body["response_format"], {"type": "json_object"})
            self.assertEqual(kwargs["timeout"], 90)
            with patch.dict(os.environ, {"POROS_OPENAI_JSON_MODE": "false"}):
                factory.return_value.open.return_value = self.response(payload)
                llm.request_llm_json("system", "prompt")
                self.assertNotIn("response_format", json.loads(factory.return_value.open.call_args.args[0].data))

    def test_invalid_and_incomplete_output(self):
        for content, reason in [("[]", "stop"), ("invalid", "stop"), ("", "stop"), ('{"ok":true}', "length")]:
            with self.subTest(content=content), patch.object(openai_provider, "build_opener") as factory:
                factory.return_value.open.return_value = self.response({"choices": [{
                    "message": {"content": content}, "finish_reason": reason,
                }]})
                with self.assertRaises(LLMProviderError):
                    llm.request_llm_json("system", "prompt")

    def test_errors_do_not_echo_provider_body_or_key(self):
        with patch.object(openai_provider, "build_opener") as factory:
            factory.return_value.open.side_effect = HTTPError(
                "https://example.test", 401, "private-test-key", {}, io.BytesIO(b"private-test-key")
            )
            with self.assertRaises(LLMProviderError) as error:
                llm.request_llm_json("system", "prompt")
            self.assertIn("401", str(error.exception))
            self.assertNotIn("private-test-key", str(error.exception))
            self.assertTrue(error.exception.__suppress_context__)

    def test_url_validation_and_redirects(self):
        for url in ["http://example.test", "https://user:secret@example.test", "https://example.test?key=secret",
                    "https://example.test/chat/completions", "not-a-url"]:
            with self.subTest(url=url), patch.dict(os.environ, {"POROS_OPENAI_BASE_URL": url}):
                self.assertFalse(llm.llm_available())
        with patch.dict(os.environ, {"POROS_OPENAI_BASE_URL": "http://127.0.0.1:8000/v1"}):
            self.assertTrue(llm.llm_available())
        self.assertIsNone(openai_provider.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))

    def test_setup_writes_private_file_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            setup.write_configuration(path, {"GITHUB_TOKEN": "test-token"})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                setup.write_configuration(path, {"GITHUB_TOKEN": "other"})
            self.assertIn("test-token", path.read_text())
            with self.assertRaises(ValueError):
                setup.write_configuration(Path(directory) / "bad", {"KEY": "a\nKEY=b"})

    def test_check_is_offline_and_redacted(self):
        with patch.object(openai_provider, "build_opener", side_effect=AssertionError("Network forbidden")), \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            self.assertTrue(setup.check())
            self.assertNotIn("private-test-key", output.getvalue())
            with patch.dict(os.environ, {"POROS_OPENAI_API_KEY": ""}):
                self.assertFalse(setup.check())

    def test_public_routes_do_not_include_legacy_workbench(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/health").json(), {
                "status": "ok", "product": "explorer", "model_configured": True,
            })
            self.assertEqual(client.get("/api/sessions").status_code, 404)
            schema = client.get("/openapi.json").json()
            self.assertIn("/api/explore/search", schema["paths"])
            self.assertTrue(all(path == "/api/health" or path.startswith("/api/explore/")
                                for path in schema["paths"]))

    def test_no_model_still_allows_metadata_search(self):
        with patch.dict(os.environ, {"POROS_OPENAI_API_KEY": ""}), \
                patch("poros_api.explorer.cached", return_value={"items": []}):
            with TestClient(app) as client:
                response = client.post("/api/explore/search", json={"query": "test"})
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["analysis_available"])

    def test_gemini_dispatch_is_preserved(self):
        with patch.dict(os.environ, {"POROS_LLM_PROVIDER": "gemini"}), \
                patch.object(llm, "request_gemini_json", return_value={"ok": True}) as complete:
            self.assertEqual(llm.request_llm_json("system", "prompt"), {"ok": True})
            complete.assert_called_once_with("system", "prompt")


if __name__ == "__main__":
    unittest.main()
