// Global state
let map = null;
const cities = [];
const markers = [];
let showLabels = true;

// DOM elements
let cityInput, findCitiesBtn, clearBtn, statusMessage, showLabelsToggle;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    cityInput = document.getElementById('cityInput');
    findCitiesBtn = document.getElementById('findCitiesBtn');
    clearBtn = document.getElementById('clearBtn');
    statusMessage = document.getElementById('statusMessage');
    showLabelsToggle = document.getElementById('showLabelsToggle');

    // Initialize map
    initMap();

    // Add event listeners
    findCitiesBtn.addEventListener('click', handleFindCities);
    clearBtn.addEventListener('click', clearMap);
    showLabelsToggle.addEventListener('change', toggleLabels);
});

/**
 * Initialize the Leaflet map
 */
function initMap() {
    // Create map centered on world view
    map = L.map('map').setView([20, 0], 2);

    // Add CartoDB Positron NoLabels tiles (clean map with borders and rivers, no labels)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);
}

/**
 * Geocode a single city using Nominatim API
 * @param {string} cityName - Name of the city to geocode
 * @returns {Promise<Object>} Result object with city data or error
 */
async function geocodeCity(cityName) {
    const baseUrl = 'https://nominatim.openstreetmap.org/search';
    const params = new URLSearchParams({
        q: cityName,
        format: 'json',
        limit: 1
    });

    try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}?${params}`, {
            headers: {
                'User-Agent': 'TopographicTestingApp/1.0'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check for rate limiting
        if (response.status === 429) {
            return {
                name: cityName,
                found: false,
                error: 'Limiet bereikt. Wacht even voordat u het opnieuw probeert.'
            };
        }

        if (!response.ok) {
            return {
                name: cityName,
                found: false,
                error: `HTTP-fout ${response.status}`
            };
        }

        const data = await response.json();

        // Check if city was found
        if (data.length === 0) {
            return {
                name: cityName,
                found: false,
                error: 'Stad niet gevonden'
            };
        }

        // Return successful result
        return {
            name: cityName,
            displayName: data[0].display_name,
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            found: true
        };

    } catch (error) {
        if (error.name === 'AbortError') {
            return {
                name: cityName,
                found: false,
                error: 'Verzoek verlopen'
            };
        }
        return {
            name: cityName,
            found: false,
            error: error.message
        };
    }
}

/**
 * Geocode multiple cities with rate limiting
 * @param {Array<string>} cityNames - Array of city names to geocode
 * @returns {Promise<Array>} Array of result objects
 */
async function geocodeCities(cityNames) {
    const results = [];

    for (let i = 0; i < cityNames.length; i++) {
        const cityName = cityNames[i];
        showStatus(`Geocoderen ${i + 1} van ${cityNames.length}: ${cityName}`, 'loading');

        const result = await geocodeCity(cityName);
        results.push(result);

        // Add marker if city was found
        if (result.found) {
            addMarkerToMap(result);
        }

        // Wait 1 second between requests (Nominatim rate limit)
        if (i < cityNames.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

/**
 * Add a marker to the map for a geocoded city
 * @param {Object} city - City object with lat, lon, name, displayName
 */
function addMarkerToMap(city) {
    // Create marker
    const marker = L.marker([city.lat, city.lon]).addTo(map);

    // Add popup with city info
    marker.bindPopup(`
        <strong>${city.name}</strong><br>
        <small>${city.displayName}</small><br>
        <small>Lat: ${city.lat.toFixed(4)}, Lon: ${city.lon.toFixed(4)}</small>
    `);

    // Open popup immediately if labels are shown
    if (showLabels) {
        marker.openPopup();
    }

    // Store marker reference
    city.marker = marker;
    markers.push(marker);
}

/**
 * Toggle display of city name labels
 */
function toggleLabels() {
    showLabels = showLabelsToggle.checked;

    markers.forEach(marker => {
        if (showLabels) {
            marker.openPopup();
        } else {
            marker.closePopup();
        }
    });
}

/**
 * Fit map view to show all markers
 */
function fitMapToMarkers() {
    if (markers.length === 0) {
        return;
    }

    if (markers.length === 1) {
        // Single marker: center and zoom
        const city = cities.find(c => c.found);
        map.setView([city.lat, city.lon], 10);
    } else {
        // Multiple markers: fit bounds
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Clear all markers from the map and reset state
 */
function clearMap() {
    // Remove all markers from map
    markers.forEach(marker => map.removeLayer(marker));
    markers.length = 0;
    cities.length = 0;

    // Reset map view
    map.setView([20, 0], 2);

    // Clear UI
    hideStatus();
}

/**
 * Show a status message
 * @param {string} message - Message to display
 * @param {string} type - Type of message (loading, success, error)
 */
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message visible ${type}`;
}

/**
 * Hide the status message
 */
function hideStatus() {
    statusMessage.className = 'status-message';
    statusMessage.textContent = '';
}

/**
 * Handle the Find Cities button click
 */
async function handleFindCities() {
    // Get input value
    const input = cityInput.value.trim();

    // Validate input
    if (!input) {
        showStatus('Voer minstens één stadsnaam in', 'error');
        setTimeout(hideStatus, 3000);
        return;
    }

    // Parse city names
    const cityNames = input
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (cityNames.length === 0) {
        showStatus('Voer minstens één stadsnaam in', 'error');
        setTimeout(hideStatus, 3000);
        return;
    }

    // Check for too many cities
    if (cityNames.length > 50) {
        showStatus('Te veel steden. Beperk tot maximaal 50 steden tegelijk.', 'error');
        setTimeout(hideStatus, 5000);
        return;
    }

    // Disable button while geocoding
    findCitiesBtn.disabled = true;
    findCitiesBtn.textContent = 'Laden...';

    // Clear previous results
    clearMap();

    try {
        // Geocode all cities
        const results = await geocodeCities(cityNames);

        // Store results
        cities.push(...results);

        // Fit map to markers
        fitMapToMarkers();

        // Show success message
        const foundCount = results.filter(r => r.found).length;
        const totalCount = results.length;
        showStatus(
            `Geocodering voltooid: ${foundCount} van ${totalCount} steden gevonden`,
            foundCount === totalCount ? 'success' : 'error'
        );

        setTimeout(hideStatus, 5000);

    } catch (error) {
        showStatus(`Fout: ${error.message}`, 'error');
    } finally {
        // Re-enable button
        findCitiesBtn.disabled = false;
        findCitiesBtn.textContent = 'Steden zoeken';
    }
}
