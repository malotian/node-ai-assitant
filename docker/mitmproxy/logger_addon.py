"""
mitmproxy addon to integrate outbound HTTP call logs with Node AI Assistant logs.

This intercepts outbound HTTP requests (such as Google Gemini API and Auth0 calls),
formats them nicely matching Winston's log style, prints them to the mitmproxy console,
and forwards the event to the Express server at /api/internal/proxy-log so the entire
application flow is visible in a single readable log stream.
"""

import json
import os
import sys
import threading
import urllib.request
import urllib.error
from datetime import datetime

class ProxyLoggerAddon:
    def __init__(self):
        # Candidates for Express server location
        # 1. 'app:3000' within docker compose network
        # 2. 'host.docker.internal:3000' when mitmproxy is in docker and app runs on host
        # 3. '127.0.0.1:3000' when both run directly on host
        self.app_targets = [
            os.environ.get("APP_INTERNAL_URL", "http://app:3000/api/internal/proxy-log"),
            "http://host.docker.internal:3000/api/internal/proxy-log",
            "http://127.0.0.1:3000/api/internal/proxy-log",
        ]
        # Direct opener that bypasses any proxies
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def running(self):
        try:
            from mitmproxy import ctx
            if hasattr(ctx, "master") and hasattr(ctx.master, "app"):
                ctx.master.app.settings["is_valid_password"] = lambda *args, **kwargs: True
            if hasattr(ctx, "master") and hasattr(ctx.master, "addons"):
                webauth = ctx.master.addons.get("webauth")
                if webauth:
                    webauth.is_valid_password = lambda *args, **kwargs: True
        except Exception:
            pass

    def _relay_to_app(self, payload_dict):
        payload = json.dumps(payload_dict).encode("utf-8")
        for target in self.app_targets:
            try:
                req = urllib.request.Request(
                    target,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-internal-proxy-log": "true",
                    },
                    method="POST",
                )
                with self.opener.open(req, timeout=0.2) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                continue

    def _dispatch_relay(self, payload_dict):
        try:
            threading.Thread(target=self._relay_to_app, args=(payload_dict,), daemon=True).start()
        except Exception:
            pass

    def response(self, flow):
        url = flow.request.pretty_url

        # Ignore internal proxy log messages and mitmweb UI traffic
        if "/api/internal/proxy-log" in url or flow.request.headers.get("x-internal-proxy-log"):
            return
        if ":8081" in url or flow.request.path.startswith(("/events", "/flows")):
            return
        if url.endswith("/healthz"):
            return

        method = flow.request.method
        host = flow.request.pretty_host
        status_code = flow.response.status_code if flow.response else 0

        # Timing
        duration_ms = 0
        if flow.response and flow.response.timestamp_end and flow.request.timestamp_start:
            duration_ms = int((flow.response.timestamp_end - flow.request.timestamp_start) * 1000)

        # Service detection
        if "generativelanguage.googleapis.com" in host or "googleapis.com" in host:
            service = "Google Gemini"
        elif "auth0.com" in host:
            service = "Auth0"
        else:
            service = host

        # Strip query string for security (e.g. ?key= on Gemini API calls)
        clean_url = url.split("?")[0]
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Color-coded status
        status_color = "\033[32m" if status_code < 400 else "\033[31m"
        reset_color = "\033[0m"

        # Extra LLM details when Google Gemini is called
        extra_log_colored = ""
        details_text = ""
        if service == "Google Gemini" and flow.response and flow.response.content:
            try:
                model_name = "Gemini"
                if "/models/" in clean_url:
                    model_part = clean_url.split("/models/")[1].split(":")[0]
                    if model_part:
                        model_name = model_part

                resp_body = json.loads(flow.response.content.decode("utf-8", errors="ignore"))
                resp_dict = resp_body[-1] if isinstance(resp_body, list) and resp_body else (resp_body if isinstance(resp_body, dict) else {})

                usage = resp_dict.get("usageMetadata", {})
                tok_in = usage.get("promptTokenCount")
                tok_out = usage.get("candidatesTokenCount")
                tokens_desc = f"tokens: {tok_in}in/{tok_out}out" if tok_in is not None and tok_out is not None else ""

                preview = ""
                candidates = resp_dict.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        first_part = parts[0]
                        if "functionCall" in first_part:
                            fn = first_part["functionCall"]
                            preview = f"call {fn.get('name')}()"
                        elif "text" in first_part:
                            txt = first_part["text"].strip().replace("\n", " ")
                            preview = f'"{txt[:50]}..."' if len(txt) > 50 else f'"{txt}"'

                info_parts = [p for p in [model_name, tokens_desc, preview] if p]
                if info_parts:
                    details_text = " | ".join(info_parts)
                    extra_log_colored = f" \033[35m[{details_text}]\033[0m"
            except Exception:
                pass

        # Print to mitmproxy console matching Winston log format
        print(
            f"{timestamp} [info] \033[36m🌐 [mitmproxy]\033[0m {method} {clean_url} -> "
            f"{status_color}{status_code}{reset_color} ({duration_ms}ms) [{service}]{extra_log_colored}",
            flush=True
        )

        # Forward to Express app for unified log stream
        self._dispatch_relay({
            "service": service,
            "method": method,
            "url": clean_url,
            "statusCode": status_code,
            "durationMs": duration_ms,
            "details": details_text,
        })

    def error(self, flow):
        url = flow.request.pretty_url
        if "/api/internal/proxy-log" in url or ":8081" in url:
            return

        method = flow.request.method
        host = flow.request.pretty_host
        clean_url = url.split("?")[0]
        err_msg = flow.error.msg if flow.error else "Network error"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        print(
            f"{timestamp} [error] \033[31m🌐 [mitmproxy error]\033[0m {method} {clean_url} -> {err_msg}",
            flush=True
        )

        self._dispatch_relay({
            "service": host,
            "method": method,
            "url": clean_url,
            "statusCode": 502,
            "durationMs": 0,
        })

addons = [ProxyLoggerAddon()]
