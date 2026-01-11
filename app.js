// Global state
let map = null;
const places = [];
const markers = [];
let CustomLabel = null; // Will be defined after Google Maps loads

// DOM elements
let cityInput, findCitiesBtn, clearBtn, statusMessage, listNameInput, saveBtn, saveStatus, toggleControlsBtn, controlsContent;
let toggleGameBtn, gameContent, nextBtn, gameStatus, gameStats, answerButtons;

// Game state
let gameMode = false;
let currentQuestion = null;
let totalQuestions = 0;
let correctAnswers = 0;
let currentStreak = 0;

// Minecraft monsters for game mode
const monsters = [
    {
        name: 'red',
        alive: 'assets/red-alive.png',
        dead: 'assets/red-dead.png'
    },
    {
        name: 'green',
        alive: 'assets/green-alive.png',
        dead: 'assets/green-dead.png'
    },
    {
        name: 'purple',
        alive: 'assets/purple-alive.png',
        dead: 'assets/purple-dead.png'
    },
    {
        name: 'blue',
        alive: 'assets/blue-alive.png',
        dead: 'assets/blue-dead.png'
    }
];

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
    toggleGameBtn = document.getElementById('toggleGameBtn');
    gameContent = document.getElementById('gameContent');
    nextBtn = document.getElementById('nextBtn');
    gameStatus = document.getElementById('gameStatus');
    gameStats = document.getElementById('gameStats');
    answerButtons = document.getElementById('answerButtons');

    // Add save button listener
    saveBtn.addEventListener('click', handleSaveList);

    // Add toggle button listeners
    toggleControlsBtn.addEventListener('click', toggleControls);
    toggleGameBtn.addEventListener('click', toggleGame);

    // Add game button listener
    nextBtn.addEventListener('click', nextQuestion);
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

        // Clear existing places
        clearMap();

        // Add places to the map (support both old 'cities' and new 'places' format)
        const placesData = listData.places || listData.cities || [];
        if (Array.isArray(placesData) && placesData.length > 0) {
            placesData.forEach(item => {
                const placeWithMarker = {
                    name: item.name,
                    displayName: item.displayName,
                    lat: item.lat,
                    lon: item.lon,
                    placeType: item.placeType || 'city', // Default to city for old data
                    found: true
                };
                places.push(placeWithMarker);
                addMarkerToMap(placeWithMarker);
            });

            // Fit map to show all markers
            fitMapToMarkers();

            // Populate the textarea with place names
            if (cityInput) {
                cityInput.value = placesData.map(item => item.name).join('\n');
            }

            showStatus(
                `Lijst "${listData.name || 'Onbekend'}" geladen met ${placesData.length} locaties`,
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
 * Toggle the game section (expand/collapse)
 */
function toggleGame() {
    gameContent.classList.toggle('collapsed');

    // Update button text
    if (gameContent.classList.contains('collapsed')) {
        toggleGameBtn.innerHTML = '<span>🎮</span> Game mode';
        gameMode = false;
        // Show all markers when exiting game mode
        showAllMarkers();
    } else {
        toggleGameBtn.innerHTML = '<span>✕</span> Sluiten';
        gameMode = true;
        // Reset stats when opening game mode
        totalQuestions = 0;
        correctAnswers = 0;
        currentStreak = 0;
        updateGameStats();

        // Initialize first question if places are loaded
        const foundPlaces = places.filter(place => place.found);
        if (foundPlaces.length >= 4) {
            nextQuestion();
        }
    }
}

/**
 * Update the game statistics display
 */
function updateGameStats() {
    gameStats.innerHTML = `
        <span>Vragen: ${totalQuestions}</span>
        <span>Goed: ${correctAnswers}</span>
        <span>Achter elkaar: ${currentStreak}</span>
    `;
}

/**
 * Start the next question in game mode
 */
function nextQuestion() {
    const foundPlaces = places.filter(place => place.found);

    if (foundPlaces.length < 4) {
        gameStatus.textContent = 'Je hebt minimaal 4 steden nodig om te spelen';
        gameStatus.style.color = '#dc3545';
        return;
    }

    // Pick a random city as the correct answer
    const correctPlace = foundPlaces[Math.floor(Math.random() * foundPlaces.length)];

    // Pick 3 other random places
    const otherPlaces = foundPlaces.filter(place => place !== correctPlace);
    const shuffled = otherPlaces.sort(() => 0.5 - Math.random());
    const wrongPlaces = shuffled.slice(0, 3);

    // Combine and shuffle all 4 options
    const allOptions = [correctPlace, ...wrongPlaces].sort(() => 0.5 - Math.random());

    // Store current question
    currentQuestion = {
        correctPlace: correctPlace,
        options: allOptions,
        answered: false
    };

    // Show only the correct place's marker
    showOnlyMarker(correctPlace);

    // Clear status
    gameStatus.textContent = '';

    // Disable Next button until answer is selected
    nextBtn.disabled = true;

    // Create answer buttons with random monster images
    answerButtons.innerHTML = '';
    const shuffledMonsters = [...monsters].sort(() => 0.5 - Math.random());

    allOptions.forEach((place, index) => {
        const button = document.createElement('button');
        button.className = 'answer-btn';
        button.textContent = place.name;

        // Assign a monster image
        const monster = shuffledMonsters[index % monsters.length];
        button.style.backgroundImage = `url('${monster.alive}')`;
        button.dataset.monsterAlive = monster.alive;
        button.dataset.monsterDead = monster.dead;

        button.addEventListener('click', () => handleAnswer(place, button));
        answerButtons.appendChild(button);
    });
}

/**
 * Handle answer selection
 */
function handleAnswer(selectedPlace, selectedButton) {
    if (currentQuestion.answered) return;

    currentQuestion.answered = true;

    // Disable all buttons and mark them
    const buttons = answerButtons.querySelectorAll('.answer-btn');
    buttons.forEach(button => {
        button.disabled = true;

        if (button.textContent === currentQuestion.correctPlace.name) {
            button.classList.add('correct');
            // Only change to dead monster if the answer was correct
            if (selectedPlace === currentQuestion.correctPlace) {
                button.style.backgroundImage = `url('${button.dataset.monsterDead}')`;
            }
        } else {
            button.classList.add('incorrect');
        }
    });

    // Update statistics
    totalQuestions++;
    if (selectedPlace === currentQuestion.correctPlace) {
        correctAnswers++;
        currentStreak++;
        gameStatus.textContent = '✅ Correct!';
        gameStatus.style.color = '#28a745';
    } else {
        currentStreak = 0;
        gameStatus.textContent = `❌ Fout! Het juiste antwoord was ${currentQuestion.correctPlace.name}`;
        gameStatus.style.color = '#dc3545';
    }

    // Update stats display
    updateGameStats();

    // Re-enable Next button after answer is selected
    nextBtn.disabled = false;
}

/**
 * Show only a specific marker on the map
 */
function showOnlyMarker(place) {
    places.forEach(p => {
        if (p.marker) {
            p.marker.setVisible(p === place);
        }
        if (p.label) {
            p.label.hide();
        }
    });
}

/**
 * Show all markers on the map
 */
function showAllMarkers() {
    places.forEach(p => {
        if (p.marker) {
            p.marker.setVisible(true);
        }
    });
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

        // Determine place type from types array
        const types = result.types || [];
        let placeType = 'city'; // default to city

        // Check if it's a river or natural water feature
        if (types.includes('natural_feature') ||
            types.includes('waterway') ||
            types.some(t => t.includes('river'))) {
            placeType = 'river';
        }
        // Check if it's a city/town
        else if (types.includes('locality') ||
                 types.includes('sublocality') ||
                 types.includes('administrative_area_level_3')) {
            placeType = 'city';
        }

        // Return successful result
        return {
            name: cityName,
            displayName: result.formatted_address,
            lat: result.geometry.location.lat,
            lon: result.geometry.location.lng,
            placeType: placeType,
            types: types,
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
 * Add a marker to the map for a geocoded place
 * @param {Object} place - Place object with lat, lon, name, displayName, placeType
 */
function addMarkerToMap(place) {
    // Determine marker color based on place type
    const markerColor = place.placeType === 'river'
        ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
        : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

    // Create marker using the old API to avoid mapId requirement
    const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lon },
        map: map,
        icon: markerColor
    });

    // Create custom label overlay
    const label = new CustomLabel(
        new google.maps.LatLng(place.lat, place.lon),
        place.name
    );
    label.setMap(map);

    // Add click listener to toggle label
    marker.addListener('click', () => {
        // Hide all other labels first
        places.forEach(p => {
            if (p.label && p.label !== label) {
                p.label.hide();
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
    place.marker = marker;
    place.label = label;
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
        const place = places.find(p => p.found);
        map.setCenter({ lat: place.lat, lng: place.lon });
        map.setZoom(10);
    } else {
        // Multiple markers: fit bounds
        const bounds = new google.maps.LatLngBounds();
        places.forEach(place => {
            if (place.found) {
                bounds.extend({ lat: place.lat, lng: place.lon });
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
    places.forEach(place => {
        if (place.label) {
            place.label.setMap(null);
        }
    });
    places.length = 0;

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
        // Geocode all places
        const results = await geocodeCities(cityNames);

        // Store results
        places.push(...results);

        // Fit map to markers
        fitMapToMarkers();

        // Show success message
        const foundCount = results.filter(r => r.found).length;
        const totalCount = results.length;
        showStatus(
            `Geocodering voltooid: ${foundCount} van ${totalCount} locaties gevonden`,
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

    // Get successfully geocoded places
    const successfulPlaces = places.filter(place => place.found);

    if (successfulPlaces.length === 0) {
        showSaveStatus('Geen locaties om op te slaan. Geocodeer eerst enkele locaties.', 'error');
        setTimeout(hideSaveStatus, 3000);
        return;
    }

    // Prepare data to save
    const listData = {
        name: listName,
        places: successfulPlaces.map(place => ({
            name: place.name,
            displayName: place.displayName,
            lat: place.lat,
            lon: place.lon,
            placeType: place.placeType
        })),
        savedAt: new Date().toISOString(),
        count: successfulPlaces.length
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
            `Lijst "${listName}" succesvol opgeslagen met ${successfulPlaces.length} locaties. URL: ${shareUrl}`,
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
