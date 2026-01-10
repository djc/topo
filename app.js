// Global state
let map = null;
const cities = [];
const markers = [];
let CustomLabel = null; // Will be defined after Google Maps loads

// DOM elements
let cityInput, findCitiesBtn, clearBtn, statusMessage, listNameInput, saveBtn, saveStatus, toggleControlsBtn, controlsContent;

// JSONBin.io configuration
// Get your API key from https://jsonbin.io (free tier available)
const JSONBIN_API_KEY = '$2a$10$Xq2vlhYhR49Zy.BjS6i6Ye2jXL6fnkb3n46O9qZHr9nwJteEpGZ.e';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    cityInput = document.getElementById('cityInput');
    findCitiesBtn = document.getElementById('findCitiesBtn');
    clearBtn = document.getElementById('clearBtn');
    statusMessage = document.getElementById('statusMessage');
    listNameInput = document.getElementById('listNameInput');
    saveBtn = document.getElementById('saveBtn');
    saveStatus = document.getElementById('saveStatus');
    toggleControlsBtn = document.getElementById('toggleControlsBtn');
    controlsContent = document.getElementById('controlsContent');

    // Add save button listener
    saveBtn.addEventListener('click', handleSaveList);

    // Add toggle button listener
    toggleControlsBtn.addEventListener('click', toggleControls);
});

/**
 * Check for query string parameter to load a list
 */
async function checkForListQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    const binId = urlParams.get('lijst');

    if (binId) {
        await loadListById(binId);
    }
}

/**
 * Load a saved list by Bin ID from JSONBin.io
 * @param {string} binId - Bin ID of the list to load
 */
async function loadListById(binId) {
    if (JSONBIN_API_KEY === 'YOUR_JSONBIN_API_KEY') {
        showStatus('JSONBin.io API key niet geconfigureerd.', 'error');
        setTimeout(hideStatus, 3000);
        return;
    }

    showStatus(`Lijst laden...`, 'loading');

    try {
        // Fetch the bin data directly by ID
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            headers: {
                'X-Access-Key': JSONBIN_API_KEY
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Lijst niet gevonden.');
            }
            throw new Error(`HTTP-fout ${response.status}`);
        }

        const binData = await response.json();
        const listData = binData.record;

        // Clear existing cities
        clearMap();

        // Add cities to the map
        if (listData.cities && Array.isArray(listData.cities)) {
            listData.cities.forEach(city => {
                const cityWithMarker = {
                    name: city.name,
                    displayName: city.displayName,
                    lat: city.lat,
                    lon: city.lon,
                    found: true
                };
                cities.push(cityWithMarker);
                addMarkerToMap(cityWithMarker);
            });

            // Fit map to show all markers
            fitMapToMarkers();

            showStatus(
                `Lijst "${listData.name || 'Onbekend'}" geladen met ${listData.cities.length} steden`,
                'success'
            );

            setTimeout(hideStatus, 5000);
        } else {
            throw new Error('Ongeldige lijst data.');
        }

    } catch (error) {
        showStatus(`Fout bij laden: ${error.message}`, 'error');
        setTimeout(hideStatus, 5000);
    }
}

/**
 * Toggle the controls section (expand/collapse)
 */
function toggleControls() {
    controlsContent.classList.toggle('collapsed');

    // Update button text
    if (controlsContent.classList.contains('collapsed')) {
        toggleControlsBtn.innerHTML = '<span>☰</span> Steden beheren';
    } else {
        toggleControlsBtn.innerHTML = '<span>✕</span> Sluiten';
    }
}

/**
 * Initialize the Google Map
 * This function is called by the Google Maps API callback
 */
function initMap() {
    // Define CustomLabel class now that google.maps is available
    CustomLabel = class extends google.maps.OverlayView {
        constructor(position, text) {
            super();
            this.position = position;
            this.text = text;
            this.div = null;
        }

        onAdd() {
            const div = document.createElement('div');
            div.className = 'custom-label';
            div.textContent = this.text;
            div.style.position = 'absolute';
            div.style.display = 'none'; // Hidden by default

            this.div = div;
            const panes = this.getPanes();
            panes.floatPane.appendChild(div);
        }

        draw() {
            const overlayProjection = this.getProjection();
            const position = overlayProjection.fromLatLngToDivPixel(this.position);

            if (this.div) {
                this.div.style.left = position.x + 'px';
                this.div.style.top = (position.y - 40) + 'px'; // Position above marker
            }
        }

        onRemove() {
            if (this.div) {
                this.div.parentNode.removeChild(this.div);
                this.div = null;
            }
        }

        show() {
            if (this.div) {
                this.div.style.display = 'block';
            }
        }

        hide() {
            if (this.div) {
                this.div.style.display = 'none';
            }
        }

        isVisible() {
            return this.div && this.div.style.display === 'block';
        }
    };

    // Create map centered on world view
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 20, lng: 0 },
        zoom: 2,
        mapTypeId: 'terrain',
        styles: [
            {
                featureType: 'all',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            },
            {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });

    // Add event listeners after map is initialized
    findCitiesBtn.addEventListener('click', handleFindCities);
    clearBtn.addEventListener('click', clearMap);

    // Check for query string parameter to load a list (after map is ready)
    checkForListQuery();
}

/**
 * Geocode a single city using Google Geocoding API
 * @param {string} cityName - Name of the city to geocode
 * @returns {Promise<Object>} Result object with city data or error
 */
async function geocodeCity(cityName) {
    const baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = new URLSearchParams({
        address: cityName,
        key: 'AIzaSyBm1PAv-S4fV3gFGaudPEr2tPuCIGx8YVo'
    });

    try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${baseUrl}?${params}`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return {
                name: cityName,
                found: false,
                error: `HTTP-fout ${response.status}`
            };
        }

        const data = await response.json();

        // Check for API errors
        if (data.status === 'ZERO_RESULTS') {
            return {
                name: cityName,
                found: false,
                error: 'Stad niet gevonden'
            };
        }

        if (data.status !== 'OK') {
            return {
                name: cityName,
                found: false,
                error: `API-fout: ${data.status}`
            };
        }

        // Get first result
        const result = data.results[0];

        // Return successful result
        return {
            name: cityName,
            displayName: result.formatted_address,
            lat: result.geometry.location.lat,
            lon: result.geometry.location.lng,
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
 * Geocode multiple cities
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
    }

    return results;
}

/**
 * Add a marker to the map for a geocoded city
 * @param {Object} city - City object with lat, lon, name, displayName
 */
function addMarkerToMap(city) {
    // Create marker
    const marker = new google.maps.Marker({
        position: { lat: city.lat, lng: city.lon },
        map: map,
        title: city.name
    });

    // Create custom label overlay
    const label = new CustomLabel(
        new google.maps.LatLng(city.lat, city.lon),
        city.name
    );
    label.setMap(map);

    // Add click listener to toggle label
    marker.addListener('click', () => {
        // Hide all other labels first
        cities.forEach(c => {
            if (c.label && c.label !== label) {
                c.label.hide();
            }
        });
        // Toggle this label
        if (label.isVisible()) {
            label.hide();
        } else {
            label.show();
        }
    });

    // Store marker and label references
    city.marker = marker;
    city.label = label;
    markers.push(marker);
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
        map.setCenter({ lat: city.lat, lng: city.lon });
        map.setZoom(10);
    } else {
        // Multiple markers: fit bounds
        const bounds = new google.maps.LatLngBounds();
        cities.forEach(city => {
            if (city.found) {
                bounds.extend({ lat: city.lat, lng: city.lon });
            }
        });
        map.fitBounds(bounds);
    }
}

/**
 * Clear all markers from the map and reset state
 */
function clearMap() {
    // Remove all markers from map
    markers.forEach(marker => marker.setMap(null));
    markers.length = 0;

    // Remove all custom labels
    cities.forEach(city => {
        if (city.label) {
            city.label.setMap(null);
        }
    });
    cities.length = 0;

    // Reset map view
    map.setCenter({ lat: 20, lng: 0 });
    map.setZoom(2);

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

/**
 * Show a save status message
 * @param {string} message - Message to display
 * @param {string} type - Type of message (success, error)
 */
function showSaveStatus(message, type) {
    saveStatus.textContent = message;
    saveStatus.className = `save-status visible ${type}`;
}

/**
 * Hide the save status message
 */
function hideSaveStatus() {
    saveStatus.className = 'save-status';
    saveStatus.textContent = '';
}

/**
 * Handle saving the city list to JSONBin.io
 */
async function handleSaveList() {
    const listName = listNameInput.value.trim();

    // Validate list name
    if (!listName) {
        showSaveStatus('Voer een naam voor de lijst in', 'error');
        setTimeout(hideSaveStatus, 3000);
        return;
    }

    // Check if API key is configured
    if (JSONBIN_API_KEY === 'YOUR_JSONBIN_API_KEY') {
        showSaveStatus('JSONBin.io API key niet geconfigureerd. Zie documentatie.', 'error');
        setTimeout(hideSaveStatus, 5000);
        return;
    }

    // Get successfully geocoded cities
    const successfulCities = cities.filter(city => city.found);

    if (successfulCities.length === 0) {
        showSaveStatus('Geen steden om op te slaan. Geocodeer eerst enkele steden.', 'error');
        setTimeout(hideSaveStatus, 3000);
        return;
    }

    // Prepare data to save
    const listData = {
        name: listName,
        cities: successfulCities.map(city => ({
            name: city.name,
            displayName: city.displayName,
            lat: city.lat,
            lon: city.lon
        })),
        savedAt: new Date().toISOString(),
        count: successfulCities.length
    };

    // Disable save button
    saveBtn.disabled = true;
    saveBtn.textContent = 'Opslaan...';

    try {
        // Create a new bin on JSONBin.io in the Topo collection
        const response = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Access-Key': JSONBIN_API_KEY,
                'X-Bin-Name': listName,
                'X-Collection-Id': '69628cdb43b1c97be9272866'
            },
            body: JSON.stringify(listData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP-fout ${response.status}`);
        }

        const result = await response.json();
        const binId = result.metadata.id;

        // Construct shareable URL
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}?lijst=${binId}`;

        showSaveStatus(
            `Lijst "${listName}" succesvol opgeslagen met ${successfulCities.length} steden. URL: ${shareUrl}`,
            'success'
        );

        // Log the bin ID for reference
        console.log('Saved to JSONBin.io with ID:', binId);
        console.log('Share URL:', shareUrl);

        setTimeout(hideSaveStatus, 10000);

    } catch (error) {
        showSaveStatus(
            `Fout bij opslaan: ${error.message}`,
            'error'
        );
        setTimeout(hideSaveStatus, 5000);
    } finally {
        // Re-enable button
        saveBtn.disabled = false;
        saveBtn.textContent = 'Opslaan';
    }
}
