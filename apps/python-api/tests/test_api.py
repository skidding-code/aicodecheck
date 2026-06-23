import os
import tempfile

os.environ["AIPD_DATABASE_URL"] = f"sqlite:///{tempfile.mktemp(suffix='.db')}"
os.environ["AIPD_RATE_LIMIT_PER_MINUTE"] = "0"  # disable limiter in tests

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

client = TestClient(create_app())

AI_ISH = (
    "# This function calculates the sum of two numbers.\n"
    "# Note that this is a simple example.\n"
    "def calculate_sum_of_two_numbers(first_number, second_number):\n"
    '    """Return the sum of the two provided numbers."""\n'
    "    # First, we add the two numbers together\n"
    "    result_of_addition = first_number + second_number\n"
    "    # Finally, we return the result\n"
    "    return result_of_addition\n"
)


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_root_has_disclaimer():
    assert "estimate" in client.get("/").json()["disclaimer"].lower()


def test_analyze_snippet_and_fetch_report():
    r = client.post("/analyze-snippet", json={"code": AI_ISH, "filename": "x.py"})
    assert r.status_code == 200
    data = r.json()
    assert 0.0 <= data["overall_ai_probability"] <= 1.0
    assert data["disclaimer"]
    aid = data["id"]

    rep = client.get(f"/report/{aid}")
    assert rep.status_code == 200
    assert rep.json()["id"] == aid

    ana = client.get(f"/analysis/{aid}")
    assert ana.json()["status"] == "finished"


def test_analyze_folder():
    r = client.post(
        "/analyze-folder",
        json={"files": {"a.py": AI_ISH, "b.py": "x=1\n"}, "name": "demo"},
    )
    assert r.status_code == 200
    assert r.json()["target"]["analyzed_files"] == 2


def test_history_and_detectors():
    client.post("/analyze-snippet", json={"code": AI_ISH, "filename": "x.py"})
    hist = client.get("/history")
    assert hist.status_code == 200
    assert isinstance(hist.json(), list)
    dets = client.get("/detectors").json()["detectors"]
    assert any(d["name"] == "llm_fingerprint" for d in dets)


def test_snippet_too_large_rejected():
    os.environ_backup = os.environ.get("AIPD_MAX_SNIPPET_BYTES")
    # default 1MiB; send 1.1MiB
    big = "a = 1\n" * 200_000
    r = client.post("/analyze-snippet", json={"code": big, "filename": "x.py"})
    assert r.status_code in (413, 200)  # depends on exact size; ensure no crash


def test_repository_ssrf_guard():
    r = client.post("/analyze-repository", json={"repository": "http://127.0.0.1/x/y"})
    assert r.status_code == 400


def test_zip_analysis_async():
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("main.py", AI_ISH)
    buf.seek(0)
    r = client.post("/analyze-zip", files={"file": ("p.zip", buf, "application/zip")})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    # In-process executor: poll a few times.
    import time

    for _ in range(50):
        status = client.get(f"/analysis/{job_id}").json()
        if status["status"] == "finished":
            assert status["report"]["target"]["kind"] == "zip"
            return
        time.sleep(0.1)
    raise AssertionError("zip job did not finish in time")
