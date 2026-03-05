# Spatial OS: WorldView Clone

A real-time spy satellite simulator inspired by [Spatial Intelligence's WorldView](https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator).
This webapp integrates real-time satellite data (CelesTrak) and live aircraft positions (OpenSky Network) rendered on a 3D globe using CesiumJS.
It also includes multiple visual modes (shaders) to mimic military surveillance interfaces: Night Vision (NVG), Thermal (FLIR), and CRT Monitor.

## Prerequisites

- Python 3.8+
- Required packages: `pip install fastapi uvicorn httpx`

## Running the app

1. Move to the `webapp` directory:
   ```bash
   cd webapp
   ```
2. Start the FastAPI backend:
   ```bash
   python main.py
   ```
3. Open a browser and navigate to:
   ```
   http://localhost:8000/
   ```

## Stack

- **Backend**: Python, FastAPI, httpx (proxies data from CelesTrak and OpenSky to avoid CORS issues).
- **Frontend**: Vanilla JavaScript, HTML, CSS.
- **Libraries**:
  - [CesiumJS](https://cesium.com/) for the 3D globe visualization.
  - [satellite.js](https://github.com/shashwatak/satellite-js) to propagate satellite TLEs to spatial coordinates.
