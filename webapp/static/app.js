// Initialize Cesium Viewer with CartoDB Dark Matter Base Map
const viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        credit: 'Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
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

// Enable lighting and night fade
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.nightFadeOutDistance = 10000000;
viewer.scene.globe.baseColor = Cesium.Color.BLACK;

// Add OSM 3D Buildings (Uses default Ion fallback, might work depending on usage)
try {
    Cesium.createOsmBuildingsAsync().then(buildings => {
        // Style buildings to look more like a wireframe/cyberpunk aesthetic
        buildings.style = new Cesium.Cesium3DTileStyle({
            color: {
                conditions: [
                    ['${height} >= 100', 'color("cyan", 0.6)'],
                    ['${height} >= 50', 'color("blue", 0.5)'],
                    ['true', 'color("darkblue", 0.3)']
                ]
            }
        });
        viewer.scene.primitives.add(buildings);
    });
} catch (e) {
    console.warn("Could not load OSM Buildings", e);
}

// Variables
let activeSatellites = [];
let aircraftEntities = {};

const satCountEl = document.getElementById('satCount');
const airCountEl = document.getElementById('airCount');

// Handle Visual Mode (Shaders)
const shaderSelectGroup = document.getElementById('shaderSelectGroup');
const cesiumContainer = document.getElementById('cesiumContainer');

if (shaderSelectGroup) {
    const buttons = shaderSelectGroup.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all
            buttons.forEach(b => b.classList.remove('active'));

            // Add active to clicked
            const target = e.currentTarget;
            target.classList.add('active');

            // Apply shader
            const mode = target.getAttribute('data-mode');
            cesiumContainer.className = '';
            if (mode !== 'default') {
                cesiumContainer.classList.add(`shader-${mode}`);
            }
        });
    });
}

// Utility: parse TLE
function parseTLE(tleData) {
    const lines = tleData.split('\n').filter(line => line.trim().length > 0);
    const satellites = [];
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
            activeSatellites = parseTLE(data.tle).slice(0, 300); // Limit to 300 for performance
            if(satCountEl) satCountEl.innerText = activeSatellites.length;

            activeSatellites.forEach(sat => {
                try {
                    const satRec = satellite.twoline2satrec(sat.tleLine1, sat.tleLine2);
                    const positions = new Cesium.SampledPositionProperty();
                    const now = Cesium.JulianDate.now();

                    for (let i = 0; i < 90; i+=10) {
                        const time = Cesium.JulianDate.addMinutes(now, i, new Cesium.JulianDate());
                        const jsDate = Cesium.JulianDate.toDate(time);
                        const positionAndVelocity = satellite.propagate(satRec, jsDate);
                        const positionEci = positionAndVelocity.position;

                        if (positionEci && typeof positionEci !== 'boolean' && positionEci.x !== undefined) {
                            const gmst = satellite.gstime(jsDate);
                            const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                            const longitude = positionGd.longitude;
                            const latitude = positionGd.latitude;
                            const height = positionGd.height * 1000;

                            if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height)) {
                                const position = Cesium.Cartesian3.fromRadians(longitude, latitude, height);
                                positions.addSample(time, position);
                            }
                        }
                    }

                    viewer.entities.add({
                        name: sat.name,
                        position: positions,
                        path: {
                            resolution: 1,
                            material: new Cesium.PolylineGlowMaterialProperty({
                                glowPower: 0.1,
                                color: Cesium.Color.CYAN.withAlpha(0.3)
                            }),
                            width: 2
                        },
                        point: {
                            pixelSize: 4,
                            color: Cesium.Color.CYAN,
                            outlineColor: Cesium.Color.WHITE,
                            outlineWidth: 1
                        },
                        description: `Active Satellite: ${sat.name}`
                    });
                } catch (e) {}
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
            if(airCountEl) airCountEl.innerText = data.states.length;

            data.states.forEach(state => {
                const icao24 = state[0];
                const callsign = state[1] ? state[1].trim() : 'UNKNOWN';
                const longitude = state[5];
                const latitude = state[6];
                const altitude = state[7] || state[13] || 10000;
                const onGround = state[8];
                const velocity = state[9];

                if (longitude !== null && latitude !== null && !onGround) {
                    currentAircraftIds.add(icao24);
                    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);

                    if (aircraftEntities[icao24]) {
                        aircraftEntities[icao24].position = position;
                        aircraftEntities[icao24].description.setValue(`Callsign: ${callsign}<br>Velocity: ${velocity} m/s<br>Altitude: ${altitude} m`);
                    } else {
                        const entity = viewer.entities.add({
                            id: icao24,
                            name: callsign,
                            position: position,
                            point: {
                                pixelSize: 6,
                                color: Cesium.Color.LIME,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 1
                            },
                            label: {
                                text: callsign,
                                font: '10pt "Share Tech Mono"',
                                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                fillColor: Cesium.Color.LIME,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 2,
                                pixelOffset: new Cesium.Cartesian2(0, -15),
                                scaleByDistance: new Cesium.NearFarScalar(1.5e2, 1.5, 8.0e6, 0.0)
                            },
                            description: `Callsign: ${callsign}<br>Velocity: ${velocity} m/s<br>Altitude: ${altitude} m`
                        });
                        aircraftEntities[icao24] = entity;
                    }
                }
            });

            Object.keys(aircraftEntities).forEach(icao24 => {
                if (!currentAircraftIds.has(icao24)) {
                    viewer.entities.removeById(icao24);
                    delete aircraftEntities[icao24];
                }
            });
        }
    } catch (err) {}
}

// Initialize
viewer.clock.shouldAnimate = true;
viewer.clock.multiplier = 1;

loadSatellites();
loadAircraft();

// Update aircraft every 15 seconds
setInterval(loadAircraft, 15000);

// Set camera position to match the angled, close-up city view of Austin, TX
setTimeout(() => {
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2200, 3000),
        orientation: {
            heading: Cesium.Math.toRadians(0.0), // Looking North
            pitch: Cesium.Math.toRadians(-25.0), // Angled down
            roll: 0.0
        },
        duration: 4
    });
}, 1000);
