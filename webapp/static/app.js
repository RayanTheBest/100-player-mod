// Initialize Cesium Viewer
const viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: new Cesium.TileMapServiceImageryProvider({
        url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
    }),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: true,
    sceneModePicker: false,
    selectionIndicator: true,
    timeline: false,
    navigationHelpButton: false,
    animation: false,
    scene3DOnly: true
});

viewer.scene.globe.enableLighting = true;
viewer.scene.globe.nightFadeOutDistance = 10000000;

// Variables
let activeSatellites = [];
let aircraftEntities = {};

const satCountEl = document.getElementById('satCount');
const airCountEl = document.getElementById('airCount');

// Handle Visual Mode (Shaders)
const shaderSelect = document.getElementById('shaderSelect');
const cesiumContainer = document.getElementById('cesiumContainer');

shaderSelect.addEventListener('change', (e) => {
    cesiumContainer.className = '';
    if (e.target.value !== 'default') {
        cesiumContainer.classList.add(`shader-${e.target.value}`);
    }
});

// Utility: parse TLE
function parseTLE(tleData) {
    const lines = tleData.split('\n').filter(line => line.trim().length > 0);
    const satellites = [];
    // TLEs are typically 3 lines (Name, Line 1, Line 2)
    // CelesTrak sometimes formats as 3 lines with the name on line 1
    for (let i = 0; i < lines.length - 2; i += 3) {
        satellites.push({
            name: lines[i].trim(),
            tleLine1: lines[i + 1].trim(),
            tleLine2: lines[i + 2].trim()
        });
    }
    return satellites;
}

// Fetch and Render Satellites
async function loadSatellites() {
    try {
        const response = await fetch('/api/satellites');
        const data = await response.json();
        if (data.tle) {
            activeSatellites = parseTLE(data.tle).slice(0, 500); // Limit to 500 for performance
            satCountEl.innerText = activeSatellites.length;

            // Add to Cesium
            activeSatellites.forEach(sat => {
                try {
                    const satRec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);

                    // create a sampled position property
                    const positions = new Cesium.SampledPositionProperty();
                    const now = Cesium.JulianDate.now();

                    for (let i = 0; i < 90; i+=5) { // 90 mins orbit roughly
                        const time = Cesium.JulianDate.addMinutes(now, i, new Cesium.JulianDate());
                        const jsDate = Cesium.JulianDate.toDate(time);
                        const positionAndVelocity = satellite.propagate(satRec, jsDate);
                        const positionEci = positionAndVelocity.position;

                        if (positionEci && typeof positionEci !== 'boolean' && positionEci.x !== undefined) {
                            const gmst = satellite.gstime(jsDate);
                            const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                            const longitude = positionGd.longitude;
                            const latitude = positionGd.latitude;
                            const height = positionGd.height * 1000; // km to m

                            if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height)) {
                                const position = Cesium.Cartesian3.fromRadians(longitude, latitude, height);
                                positions.addSample(time, position);
                            }
                        }
                    }

                    viewer.entities.add({
                        name: sat.name,
                        position: positions,
                        point: {
                            pixelSize: 5,
                            color: Cesium.Color.RED,
                            outlineColor: Cesium.Color.WHITE,
                            outlineWidth: 1
                        },
                        description: `Active Satellite: ${sat.name}`
                    });
                } catch (e) {
                    console.warn(`Failed to process satellite ${sat.name}:`, e);
                }
            });
        }
    } catch (err) {
        console.error("Failed to load satellites", err);
    }
}

// Fetch and Render Aircraft
async function loadAircraft() {
    try {
        const response = await fetch('/api/aircraft');
        const data = await response.json();

        if (data.states) {
            const currentAircraftIds = new Set();
            airCountEl.innerText = data.states.length;

            data.states.forEach(state => {
                const icao24 = state[0];
                const callsign = state[1] ? state[1].trim() : 'UNKNOWN';
                const origin = state[2];
                const longitude = state[5];
                const latitude = state[6];
                const altitude = state[7] || state[13] || 10000; // meters
                const onGround = state[8];
                const velocity = state[9]; // m/s
                const heading = state[10];

                if (longitude !== null && latitude !== null && !onGround) {
                    currentAircraftIds.add(icao24);
                    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);

                    if (aircraftEntities[icao24]) {
                        // Update existing
                        aircraftEntities[icao24].position = position;
                        aircraftEntities[icao24].description.setValue(`Callsign: ${callsign}<br>Velocity: ${velocity} m/s<br>Altitude: ${altitude} m`);
                    } else {
                        // Create new
                        const entity = viewer.entities.add({
                            id: icao24,
                            name: callsign,
                            position: position,
                            point: {
                                pixelSize: 8,
                                color: Cesium.Color.LIME,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 1
                            },
                            label: {
                                text: callsign,
                                font: '10pt monospace',
                                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                fillColor: Cesium.Color.LIME,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 2,
                                pixelOffset: new Cesium.Cartesian2(0, -15)
                            },
                            description: `Callsign: ${callsign}<br>Velocity: ${velocity} m/s<br>Altitude: ${altitude} m`
                        });
                        aircraftEntities[icao24] = entity;
                    }
                }
            });

            // Remove aircraft no longer in the state
            Object.keys(aircraftEntities).forEach(icao24 => {
                if (!currentAircraftIds.has(icao24)) {
                    viewer.entities.removeById(icao24);
                    delete aircraftEntities[icao24];
                }
            });
        }
    } catch (err) {
        console.error("Failed to load aircraft", err);
    }
}

// Initialize
viewer.clock.shouldAnimate = true;
viewer.clock.multiplier = 1;

loadSatellites();
loadAircraft();

// Update aircraft every 15 seconds
setInterval(loadAircraft, 15000);

// Focus on Texas (Austin Area)
viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 500000), // Austin, TX area
    duration: 3
});
