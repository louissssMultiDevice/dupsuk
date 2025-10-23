# ai_server.py
from fastapi import FastAPI
from pydantic import BaseModel
import requests
import subprocess
import shlex
import os
import uvicorn

app = FastAPI()

class GenReq(BaseModel):
    prompt: str
    history: list = []
    max_tokens: int = 512

# CONFIG: ubah sesuai lokasi model server / cara kamu jalankan
MODEL_SERVER_URL = os.environ.get("MODEL_SERVER_URL", "")  # contoh: http://localhost:8001/generate
USE_MODEL_HTTP = bool(MODEL_SERVER_URL)

def call_model_via_http(prompt, history, max_tokens):
    payload = {"prompt": prompt, "history": history, "max_tokens": max_tokens}
    r = requests.post(MODEL_SERVER_URL, json=payload, timeout=60)
    r.raise_for_status()
    return r.json().get("reply", "")

def call_model_via_subprocess(prompt, history, max_tokens):
    # Contoh sederhana: memanggil generate.py dengan arg --prompt
    # Pastikan environment dan path ckpt benar seperti README (heavy GPU expected)
    cmd = f"python inference/generate.py --config config_671B_v3.2.json --ckpt-path /path/to/ckpt --prompt {shlex.quote(prompt)} --max-tokens {int(max_tokens)}"
    proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"Model error: {proc.stderr}")
    # parsing stdout (bergantung output generate.py) — ambil akhir stdout
    out = proc.stdout.strip()
    return out

def call_model(prompt, history, max_tokens):
    if USE_MODEL_HTTP:
        return call_model_via_http(prompt, history, max_tokens)
    else:
        return call_model_via_subprocess(prompt, history, max_tokens)

@app.post("/api/generate")
def generate(req: GenReq):
    try:
        reply = call_model(req.prompt, req.history, req.max_tokens)
        return {"ok": True, "reply": reply}
    except Exception as e:
        return {"ok": False, "error": str(e)}

if __name__ == "__main__":
    uvicorn.run("ai_server:app", host="0.0.0.0", port=8000, reload=False)
