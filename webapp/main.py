from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import httpx
import os

app = FastAPI()

# Mount the static directory to serve static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    return FileResponse(os.path.join(static_dir, "index.html"))

@app.get("/api/satellites")
async def get_satellites():
    url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=30.0)
            if response.status_code == 200:
                return {"tle": response.text}
            return {"error": f"Status code: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

@app.get("/api/aircraft")
async def get_aircraft():
    # Austin, TX bounding box (roughly)
    url = "https://opensky-network.org/api/states/all?lamin=29.5&lomin=-98.5&lamax=31.0&lomax=-96.5"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=10.0)
            if response.status_code == 200:
                return response.json()
            return {"error": f"Status code: {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
