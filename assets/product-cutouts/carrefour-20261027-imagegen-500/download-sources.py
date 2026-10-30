"""Download the supplier URLs stored in the fixed Supabase selection; no image edits."""
import concurrent.futures
import json
from pathlib import Path
from urllib.parse import urlparse
from curl_cffi import requests

ROOT = Path(__file__).resolve().parent


def download(job):
    lot, product = job
    target = ROOT / lot / "sources" / (product["id"] + ".jpg")
    target.parent.mkdir(parents=True, exist_ok=True)
    receipt = ROOT / lot / "receipts" / (product["id"] + ".json")
    if receipt.exists() and json.loads(receipt.read_text()).get("sourceDeleted") is True:
        return {"lot": lot, "id": product["id"], "status": "completed_source_deleted"}
    if target.exists() and target.read_bytes().startswith(b"\xff\xd8"):
        return {"lot": lot, "id": product["id"], "status": "existing"}
    url = product["thumbnail"]
    if urlparse(url).hostname != "static.carrefour.es":
        raise ValueError("Unexpected source host")
    try:
        response = requests.get(url, impersonate="chrome", headers={
            "Accept": "image/jpeg,image/png;q=0.9,*/*;q=0.1",
        }, timeout=30)
        response.raise_for_status()
        if not response.content.startswith(b"\xff\xd8"):
            raise ValueError("Expected JPEG; got " + str(response.headers.get("content-type")))
        temporary = target.with_suffix(".jpg.downloading")
        temporary.write_bytes(response.content)
        temporary.replace(target)
        return {"lot": lot, "id": product["id"], "status": "downloaded", "bytes": len(response.content)}
    except Exception as error:
        return {"lot": lot, "id": product["id"], "status": "failed", "error": str(error)}


jobs = []
for folder in sorted(ROOT.glob("lot-0*")):
    manifest = json.loads((folder / "manifest.json").read_text())
    jobs.extend((folder.name, product) for product in manifest["products"] + manifest["reserves"])
results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    for result in executor.map(download, jobs):
        results.append(result)
        if len(results) % 25 == 0:
            print(json.dumps({"processed": len(results), "failed": sum(row["status"] == "failed" for row in results)}), flush=True)
(ROOT / "source-acquisition.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps({"processed": len(results), "failed": sum(row["status"] == "failed" for row in results)}), flush=True)
