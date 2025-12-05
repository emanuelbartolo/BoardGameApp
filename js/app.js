document.addEventListener('DOMContentLoaded', () => {
    // --- App State ---
    let currentUser = localStorage.getItem('bgg_username');
    const adminUser = 'leli84'; // The designated admin
    let currentLayout = localStorage.getItem('bgg_layout') || 'large-grid';
    let userFavorites = []; // list of bggIds favorited by the current user
    let showOnlyFavorites = false; // whether to filter collection to only favorites

    // --- DOM Elements ---
    // --- DOM Elements ---
    const getElement = (id) => {
        const el = document.getElementById(id);
        if (!el) {
            console.error(`Error: Element with ID '${id}' not found.`);
        }
        return el;
    };

    const views = {
        login: getElement('login-view'),
        collection: getElement('collection-view'),
        shortlist: getElement('shortlist-view'),
        events: getElement('events-view'),
        admin: getElement('admin-view'),
    };

    const navLinks = {
        collection: getElement('nav-collection'),
        shortlist: getElement('nav-shortlist'),
        events: getElement('nav-events'),
        admin: getElement('nav-admin'),
        login: getElement('nav-login'),
    };

    const userDisplay = document.getElementById('user-display');
    const adminPanel = document.getElementById('admin-panel');
    const gameCollectionContainer = document.getElementById('game-collection');
    const shortlistGamesContainer = document.getElementById('shortlist-games');
    const layoutSwitcher = document.getElementById('layout-switcher');
    const gameDetailsModal = new bootstrap.Modal(document.getElementById('game-details-modal'));
    let currentlySelectedBggId = null; // To track which game is in the modal

    const wishlistFilterButton = document.getElementById('wishlist-filter-button');

    // --- Firebase Refs ---
    const db = firebase.firestore();
    const gamesCollectionRef = db.collection('games');
    const shortlistCollectionRef = db.collection('shortlist');
    const userWishlistsCollectionRef = db.collection('user_wishlists');
    const eventsCollectionRef = db.collection('events');
    const pollsCollectionRef = db.collection('polls'); // New: polls collection
    const usersCollectionRef = db.collection('users'); // New: users collection

    // --- Core Functions ---

    // --- Localization ---
    let translations = {};

    async function loadTranslations(lang) {
        try {
            const response = await fetch(`locales/${lang}.json`);
            if (!response.ok) {
                console.error(`Could not load ${lang}.json`);
                return;
            }
            translations = await response.json();
            updateUIText();
        } catch (error) {
            console.error('Error loading translations:', error);
        }
    }

    function updateUIText() {
        document.querySelectorAll('[data-i18n-key]').forEach(el => {
            const key = el.getAttribute('data-i18n-key');
            if (translations[key]) {
                if (el.placeholder) {
                    el.placeholder = translations[key];
                } else {
                    el.textContent = translations[key];
                }
            }
        });
        // Also update dynamic parts of the UI that are not in the initial HTML
        updateUserDisplay();
    }
    // --- End Localization ---

    function showView(viewName) {
        Object.values(views).forEach(view => view && view.classList.add('d-none'));
        if (views[viewName]) {
            views[viewName].classList.remove('d-none');
        } else {
            console.warn(`View element not found for: ${viewName}`);
        }
        // Update active class for nav links
        Object.values(navLinks).forEach(link => link && link.classList.remove('active'));
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        }

        // Update URL hash without triggering hashchange event
        if (window.location.hash !== `#${viewName}`) {
            history.pushState(null, null, `#${viewName}`);
        }

        // Special handling for login view: ensure usernames are fetched
        if (viewName === 'login') {
            fetchUsernames();
        } else if (viewName === 'shortlist') {
            fetchAndDisplayShortlist();
        } else if (viewName === 'events') {
            fetchAndDisplayEvents();
            fetchAndDisplayPolls();
        } else if (viewName === 'collection') {
            loadUserWishlist().then(() => fetchAndDisplayGames());
        }
    }

    function handleHashChange() {
        const hash = window.location.hash.substring(1); // Remove the #
        if (hash && views[hash]) {
            showView(hash);
        } else {
            // Default to login view if hash is empty or invalid
            showView('login');
        }
    }

    const createPollButton = getElement('create-poll-button');
    const pollsListContainer = getElement('polls-list');
    const addPollOptionButton = getElement('add-poll-option');
    const savePollButton = getElement('save-poll-button');
    const pollOptionsContainer = getElement('poll-options-container');
    const createPollModal = new bootstrap.Modal(getElement('create-poll-modal'));

    // New login elements
    const usernameInput = getElement('username-input');
    const existingUsersDropdown = getElement('existing-users-dropdown');

    // User management elements
    const userListContainer = getElement('user-list-container');

    function applyLayout(layout) {
        gameCollectionContainer.className = 'row'; // Reset classes
        gameCollectionContainer.classList.add(`layout-${layout}`);
        
        // Update button active state
        layoutSwitcher.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === layout);
        });

        // Save preference
        localStorage.setItem('bgg_layout', layout);
        currentLayout = layout;
    }

    function updateUserNav() {
        if (currentUser) {
            // User is logged in: show app nav, hide login nav
            navLinks.collection.parentElement.classList.remove('d-none');
            navLinks.shortlist.parentElement.classList.remove('d-none');
            navLinks.events.parentElement.classList.remove('d-none');
            // Show admin nav only to admin (unhide both the li and the anchor)
            if (navLinks.admin) {
                if (currentUser === adminUser) {
                    if (navLinks.admin.parentElement) navLinks.admin.parentElement.classList.remove('d-none');
                    navLinks.admin.classList.remove('d-none');
                } else {
                    if (navLinks.admin.parentElement) navLinks.admin.parentElement.classList.add('d-none');
                    navLinks.admin.classList.add('d-none');
                }
            }
            navLinks.login.parentElement.classList.add('d-none');
        } else {
            // User is logged out: hide app nav, show login nav
            navLinks.collection.parentElement.classList.add('d-none');
            navLinks.shortlist.parentElement.classList.add('d-none');
            navLinks.events.parentElement.classList.add('d-none');
            if (navLinks.admin && navLinks.admin.parentElement) navLinks.admin.parentElement.classList.add('d-none');
            if (navLinks.admin) navLinks.admin.classList.add('d-none');
            navLinks.login.parentElement.classList.remove('d-none');
        }
    }

    function updateUserDisplay() {
        if (currentUser) {
            userDisplay.innerHTML = `
                <span class="me-2">${translations.logged_in_as || 'Logged in as:'} <strong>${currentUser}</strong></span>
                <button class="btn btn-sm btn-outline-secondary" id="logout-button">${translations.logout_button || 'Logout'}</button>
            `;
            // Show admin panel if the current user is the admin
            if (adminPanel) {
                if (currentUser === adminUser) {
                    adminPanel.classList.remove('d-none');
                    // Load admin wishlist summary
                    loadWishlistSummary();
                    // Load users for admin to manage
                    fetchAndDisplayUsers();
                } else {
                    adminPanel.classList.add('d-none');
                }
            }
            // Show wishlist filter to logged-in users
            if (wishlistFilterButton) {
                wishlistFilterButton.classList.remove('d-none');
            }
            // Show create-event button for logged-in users
            const createEventBtn = document.getElementById('create-event-button');
            if (createEventBtn) createEventBtn.classList.remove('d-none');
            // Show create-poll button only to admin
            if (createPollButton) {
                if (currentUser === adminUser) {
                    createPollButton.classList.remove('d-none');
                } else {
                    createPollButton.classList.add('d-none');
                }
            }
        } else {
            userDisplay.innerHTML = `<span>${translations.not_logged_in || 'Not logged in'}</span>`;
            if (adminPanel) {
                adminPanel.classList.add('d-none');
            }
            if (wishlistFilterButton) {
                wishlistFilterButton.classList.add('d-none');
            }
            const createEventBtn = document.getElementById('create-event-button');
            if (createEventBtn) createEventBtn.classList.add('d-none');
            if (createPollButton) createPollButton.classList.add('d-none');
        }
        updateUserNav(); // Update nav visibility along with user display
    }

    // Load the current user's wishlist (favorites)
    async function loadUserWishlist() {
        if (!currentUser) { userFavorites = []; return; }
        try {
            const doc = await userWishlistsCollectionRef.doc(currentUser).get();
            userFavorites = doc.exists ? (doc.data().favorites || []) : [];
        } catch (err) {
            console.error('Error loading user wishlist:', err);
            userFavorites = [];
        }
    }

    // Toggle favorite for current user
    async function toggleFavorite(bggId) {
        if (!currentUser) { alert('Please login to manage your wishlist.'); return; }
        const docRef = userWishlistsCollectionRef.doc(currentUser);
        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(docRef);
                let favs = doc.exists ? (doc.data().favorites || []) : [];
                if (favs.includes(bggId)) {
                    favs = favs.filter(id => id !== bggId);
                } else {
                    favs.push(bggId);
                }
                t.set(docRef, { favorites: favs });
                userFavorites = favs;
            });
            // Determine if re-render is needed based on showOnlyFavorites filter
            if (showOnlyFavorites) {
                await fetchAndDisplayGames(); // Re-render if filtering by favorites
            } else {
                // Only update the specific button's UI if not re-rendering the whole list
                const favButton = document.querySelector(`.favorite-toggle[data-bgg-id="${bggId}"]`);
                if (favButton) {
                    favButton.classList.toggle('active', userFavorites.includes(bggId));
                    favButton.textContent = userFavorites.includes(bggId) ? '★' : '☆';
                }
            }
        } catch (err) {
            console.error('Error toggling favorite:', err);
            alert('Could not update your wishlist.');
        }
    }

    // Admin: load wishlist summary (counts per game with user details and game cards)
    async function loadWishlistSummary() {
        const summaryDiv = document.getElementById('wishlist-summary');
        summaryDiv.innerHTML = '<p class="text-muted">Loading wishlist summary...</p>';
        try {
            const snap = await userWishlistsCollectionRef.get();
            const counts = {}; // { bggId: count }
            const usersByGame = {}; // { bggId: [username1, username2, ...] }
            
            snap.forEach(doc => {
                const username = doc.id;
                const favs = doc.data().favorites || [];
                favs.forEach(id => {
                    counts[id] = (counts[id] || 0) + 1;
                    if (!usersByGame[id]) usersByGame[id] = [];
                    usersByGame[id].push(username);
                });
            });
            
            const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
            if (entries.length === 0) {
                summaryDiv.innerHTML = '<p>No wishlists yet.</p>';
                return;
            }
            
            let html = '<h5>Wishlist Summary</h5><div class="row" id="wishlist-summary-games">';
            for (const [bggId, count] of entries) {
                const gdoc = await gamesCollectionRef.doc(bggId).get();
                if (!gdoc.exists) continue;
                
                const game = gdoc.data();
                const users = usersByGame[bggId] ? usersByGame[bggId].join(', ') : '';
                
                // Check if already shortlisted
                const shortlistDoc = await shortlistCollectionRef.doc(bggId).get();
                const isShortlisted = shortlistDoc.exists;
                const btnText = isShortlisted ? 'Shortlisted ✓' : 'Shortlist';
                const btnClass = isShortlisted ? 'voted' : '';
                
                html += `
                    <div class="col-12 mb-4">
                        <div class="card list-layout" data-bgg-id="${game.bggId}">
                            <div style="display: flex; flex-direction: row; align-items: center;">
                                <img src="${game.image}" class="card-img-top" alt="${game.name}" style="width: 100px; height: 100px; margin-right: 1rem; object-fit: cover; flex-shrink: 0;">
                                <div class="card-body" style="flex-grow: 1;">
                                    <h6 class="card-title">${game.name}</h6>
                                    <div class="small text-muted mb-2">
                                        <strong>${count} wish${count>1? 'es':''}</strong> — ${users}
                                    </div>
                                    <button class="btn btn-sm btn-vote add-to-shortlist-button wishlist-shortlist-btn ${btnClass}" data-bgg-id="${game.bggId}" aria-pressed="${isShortlisted}">
                                        ${btnText}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            html += '</div>';
            summaryDiv.innerHTML = html;
        } catch (err) {
            console.error('Error loading wishlist summary:', err);
            summaryDiv.innerHTML = '<p class="text-danger">Could not load wishlist summary.</p>';
        }
    }

    async function fetchAndDisplayShortlist() {
        // Use onSnapshot for real-time updates
        shortlistCollectionRef.orderBy('name').onSnapshot(snapshot => {
            shortlistGamesContainer.innerHTML = ''; // Clear old list
            if (snapshot.empty) {
                shortlistGamesContainer.innerHTML = '<p>No games on the shortlist yet.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const game = doc.data();
                const voters = game.voters || [];
                const userHasVoted = currentUser && voters.includes(currentUser);
                // Single toggle button: 'Vote' to support, 'Voted ✓' when already supported
                const btnText = userHasVoted ? 'Voted ✓' : 'Vote';
                const btnTitle = userHasVoted ? 'You have voted — click to remove your vote' : 'Click to vote for this game';
                const btnClass = `btn btn-sm btn-vote shortlist-toggle-button ${userHasVoted ? 'voted' : ''}`;
                const removeBtn = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-danger ms-2 remove-shortlist-button" data-bgg-id="${game.bggId}">Remove</button>` : '';

                const gameCard = `
                    <div class="col-12 mb-4">
                        <div class="card game-card list-layout" data-bgg-id="${game.bggId}">
                            <img src="${game.image}" class="card-img-top" alt="${game.name}">
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <p class="card-text">${game.year || ''}</p>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="d-flex align-items-center">
                                        <button class="${btnClass}" data-bgg-id="${game.bggId}" title="${btnTitle}" aria-pressed="${userHasVoted}">${btnText}</button>
                                        ${removeBtn}
                                    </div>
                                    <span class="badge bg-primary" title="${voters.join(', ')}">
                                        ${voters.length} votes
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                shortlistGamesContainer.insertAdjacentHTML('beforeend', gameCard);
            });
        }, error => {
            console.error("Error fetching shortlist:", error);
            shortlistGamesContainer.innerHTML = '<p class="text-danger">Could not fetch shortlist.</p>';
        });
    }

    async function fetchAndDisplayGames() {
        gameCollectionContainer.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
        
        try {
            // Load current shortlist so we can mark admin buttons for already-shortlisted games
            const shortlistSnapshot = await shortlistCollectionRef.get();
            const shortlistedMap = {};
            shortlistSnapshot.forEach(doc => { shortlistedMap[doc.id] = doc.data(); });

            const snapshot = await gamesCollectionRef.orderBy('name').get();
            gameCollectionContainer.innerHTML = ''; // Clear spinner
            
            if (snapshot.empty) {
                gameCollectionContainer.innerHTML = '<p>No games in the collection yet. The admin needs to upload a BGG collection file.</p>';
                return;
            }

            let colClass = 'col-xl-2 col-lg-3 col-md-4 col-6'; // Default to large-grid (same as old small-grid)
            if (currentLayout === 'small-grid') colClass = 'col-xl-1 col-lg-2 col-md-3 col-4';
            if (currentLayout === 'list') colClass = 'col-12';

            snapshot.forEach(doc => {
                const game = doc.data();
                // If user requested wishlist-only filter, skip non-favorites
                if (showOnlyFavorites && currentUser && !userFavorites.includes(game.bggId)) {
                    return; // skip
                }

                const cardLayoutClass = currentLayout === 'list' ? 'list-layout' : '';
                const isFav = currentUser && userFavorites.includes(game.bggId);
                const favBtnClass = isFav ? 'active' : '';
                const favButton = `<button class="btn btn-sm btn-outline-warning favorite-toggle ${favBtnClass}" data-bgg-id="${game.bggId}" title="Toggle favorite">${isFav ? '★' : '☆'}</button>`;
                // Show Shortlist button on collection page only to admin. If the game is already shortlisted, mark as voted/highlighted.
                let voteButtonHTML = '';
                if (currentUser === adminUser) {
                    const shortlistDoc = shortlistedMap[game.bggId];
                    const isShortlisted = Boolean(shortlistDoc);
                    const voters = shortlistDoc ? (shortlistDoc.voters || []) : [];
                    const isVotedByAdmin = voters.includes(currentUser);
                    const btnText = isShortlisted ? 'Shortlisted ✓' : 'Shortlist';
                    const btnClass = isVotedByAdmin ? 'voted' : (isShortlisted ? 'shortlisted' : '');
                    voteButtonHTML = `<button class="btn btn-sm btn-vote add-to-shortlist-button ${btnClass}" data-bgg-id="${game.bggId}" aria-pressed="${isVotedByAdmin}">${btnText}</button>`;
                }
                    const gameCard = `
                    <div class="${colClass} mb-4">
                        <div class="card game-card ${cardLayoutClass}" data-bgg-id="${game.bggId}">
                            <img src="${game.image}" class="card-img-top" alt="${game.name}">
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <p class="card-text">${game.year || ''}</p>
                                    <div class="d-flex gap-2">
                                        ${favButton}
                                        ${voteButtonHTML}
                                    </div>
                            </div>
                        </div>
                    </div>
                `;
                gameCollectionContainer.insertAdjacentHTML('beforeend', gameCard);
            });
        } catch (error) {
            console.error("Error fetching games from Firebase:", error);
            gameCollectionContainer.innerHTML = '<p class="text-danger">Could not fetch game collection from Firebase.</p>';
        }
    }

    // --- Event Listeners ---

    // Show password field if admin username is typed
    usernameInput.addEventListener('input', (e) => {
        const passwordField = getElement('password-field');
        if (passwordField) {
            if (e.target.value.toLowerCase() === adminUser) {
                passwordField.classList.remove('d-none');
            } else {
                passwordField.classList.add('d-none');
            }
        }
        // Reset dropdown if user starts typing a new name
        if (existingUsersDropdown) {
            existingUsersDropdown.value = '';
        }
    });

    // Handle dropdown selection
    if (existingUsersDropdown) {
        existingUsersDropdown.addEventListener('change', (e) => {
            if (e.target.value) {
                usernameInput.value = e.target.value; // Populate text input with selected name
                const passwordField = getElement('password-field');
                if (passwordField) {
                    if (e.target.value.toLowerCase() === adminUser) {
                        passwordField.classList.remove('d-none');
                    } else {
                        passwordField.classList.add('d-none');
                    }
                }
            } else {
                usernameInput.value = ''; // Clear text input if 'Select existing user' is chosen
            }
        });
    }

    // Login
    document.getElementById('login-button').addEventListener('click', async () => {
        let username = usernameInput.value.trim();
        
        // If no username typed, check if one was selected from dropdown
        if (!username && existingUsersDropdown && existingUsersDropdown.value) {
            username = existingUsersDropdown.value;
        }

        if (!username) {
            alert("Please enter a username or select an existing one.");
            return;
        }

        // Admin Login
        if (username.toLowerCase() === adminUser) {
            const password = getElement('password-input').value;
            if (password === 'bgg') { 
                currentUser = adminUser;
                localStorage.setItem('bgg_username', adminUser);
                updateUserDisplay();
                showView('collection');
                await loadUserWishlist();
                fetchAndDisplayGames();
                // Ensure admin user is also in the users collection
                try {
                    const userDoc = await usersCollectionRef.doc(adminUser).get();
                    if (!userDoc.exists) {
                        await usersCollectionRef.doc(adminUser).set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                        fetchUsernames(); // Refresh dropdown with admin user
                    }
                } catch (err) {
                    console.error('Error saving admin user to users collection:', err);
                }
            } else {
                alert('Incorrect admin password.');
            }
            return;
        }

        // Regular User Login
        currentUser = username;
        localStorage.setItem('bgg_username', username);
        updateUserDisplay();
        showView('collection');
        await loadUserWishlist();
        fetchAndDisplayGames();

        // Save new user to Firebase if they don't already exist
        try {
            const userDoc = await usersCollectionRef.doc(username).get();
            if (!userDoc.exists) {
                await usersCollectionRef.doc(username).set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                fetchUsernames(); // Refresh dropdown with new user
            }
        } catch (err) {
            console.error('Error saving new user:', err);
        }
    });

    // Logout
    userDisplay.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'logout-button') {
            currentUser = null;
            localStorage.removeItem('bgg_username');
            document.getElementById('username-input').value = '';
            document.getElementById('password-input').value = '';
            document.getElementById('password-field').classList.add('d-none');
            updateUserDisplay();
            showView('login');
            gameCollectionContainer.innerHTML = ''; // Clear the games list on logout
        }
    });

    // Navigation
    navLinks.login.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = 'login'; });
    navLinks.collection.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = 'collection'; });
    navLinks.shortlist.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = 'shortlist'; });
    navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = 'admin'; });
    navLinks.events.addEventListener('click', (e) => { e.preventDefault(); window.location.hash = 'events'; });

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Layout Switcher
    layoutSwitcher.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            applyLayout(e.target.dataset.layout);
            fetchAndDisplayGames(); // Re-render the collection with the new layout classes
        }
    });

    // Wishlist filter toggle
    wishlistFilterButton.addEventListener('click', (e) => {
        showOnlyFavorites = !showOnlyFavorites;
        wishlistFilterButton.classList.toggle('active', showOnlyFavorites);
        wishlistFilterButton.textContent = showOnlyFavorites ? 'My Wishlist (on)' : 'My Wishlist';
        fetchAndDisplayGames();
    });

    // Show Game Details Modal
    gameCollectionContainer.addEventListener('click', async (e) => {
        const card = e.target.closest('.game-card');
        // Favorite toggle
        if (e.target.classList.contains('favorite-toggle')) {
            const bggId = e.target.dataset.bggId;
            await toggleFavorite(bggId);
            return;
        }

        // Ignore clicks on the vote button for opening details
        if (card && !e.target.classList.contains('add-to-shortlist-button')) {
            currentlySelectedBggId = card.dataset.bggId; // Store the ID
            const gameDoc = await gamesCollectionRef.doc(currentlySelectedBggId).get();
            if (gameDoc.exists) {
                const game = gameDoc.data();
                document.getElementById('game-modal-title').textContent = game.name;
                
                let detailsHtml = `
                    <div class="row">
                        <div class="col-md-4">
                            <img src="${game.image}" class="img-fluid rounded" alt="${game.name}">
                        </div>
                        <div class="col-md-8">
                `;

                // Conditionally add details if they exist and are not 'N/A'
                if (game.minPlayers && game.minPlayers !== 'N/A') {
                    detailsHtml += `<p><strong>Players:</strong> ${game.minPlayers} - ${game.maxPlayers}</p>`;
                }
                if (game.playingTime && game.playingTime !== 'N/A') {
                    detailsHtml += `<p><strong>Play Time:</strong> ${game.playingTime} min</p>`;
                }
                if (game.rating && game.rating !== 'N/A') {
                    detailsHtml += `<p><strong>Rating:</strong> ${game.rating} / 10</p>`;
                }
                if (game.year) {
                    detailsHtml += `<p><strong>Year Published:</strong> ${game.year}</p>`;
                }

                // Add the styled BGG link
                detailsHtml += `
                    <p class="mt-3">
                        <a href="https://boardgamegeek.com/boardgame/${game.bggId}" target="_blank" class="btn btn-sm btn-outline-primary">${translations.modal_view_on_bgg_button || 'View on BGG'}</a>
                    </p>
                    <hr>
                    <div id="ai-summary-container"></div>
                `;

                detailsHtml += `
                        </div>
                    </div>
                `;

                document.getElementById('game-modal-body').innerHTML = detailsHtml;

                // --- Check for and display existing summary ---
                const lang = localStorage.getItem('bgg_lang') || 'en';
                const summaryField = `summary_${lang}`;
                if (game[summaryField]) {
                    const summaryContainer = document.getElementById('ai-summary-container');
                    summaryContainer.innerHTML = `<p><strong>${translations.ai_summary_heading || 'AI Summary:'}</strong> ${game[summaryField]}</p>`;
                }
                // --- End summary check ---

                gameDetailsModal.show();
            }
        }
    });

    // Show Game Details Modal for Shortlist
    shortlistGamesContainer.addEventListener('click', async (e) => {
        const card = e.target.closest('.game-card');
        // Ignore clicks on the vote button for opening details
        if (card && !e.target.classList.contains('shortlist-toggle-button') && !e.target.classList.contains('remove-shortlist-button')) {
            currentlySelectedBggId = card.dataset.bggId; // Store the ID
            const gameDoc = await gamesCollectionRef.doc(currentlySelectedBggId).get();
            if (gameDoc.exists) {
                const game = gameDoc.data();
                document.getElementById('game-modal-title').textContent = game.name;
                
                let detailsHtml = `
                    <div class="row">
                        <div class="col-md-4">
                            <img src="${game.image}" class="img-fluid rounded" alt="${game.name}">
                        </div>
                        <div class="col-md-8">
                `;

                // Conditionally add details if they exist and are not 'N/A'
                if (game.minPlayers && game.minPlayers !== 'N/A') {
                    detailsHtml += `<p><strong>Players:</strong> ${game.minPlayers} - ${game.maxPlayers}</p>`;
                }
                if (game.playingTime && game.playingTime !== 'N/A') {
                    detailsHtml += `<p><strong>Play Time:</strong> ${game.playingTime} min</p>`;
                }
                if (game.rating && game.rating !== 'N/A') {
                    detailsHtml += `<p><strong>Rating:</strong> ${game.rating} / 10</p>`;
                }
                if (game.year) {
                    detailsHtml += `<p><strong>Year Published:</strong> ${game.year}</p>`;
                }

                // Add the styled BGG link
                detailsHtml += `
                    <p class="mt-3">
                        <a href="https://boardgamegeek.com/boardgame/${game.bggId}" target="_blank" class="btn btn-sm btn-outline-primary">${translations.modal_view_on_bgg_button || 'View on BGG'}</a>
                    </p>
                    <hr>
                    <div id="ai-summary-container"></div>
                `;

                detailsHtml += `
                        </div>
                    </div>
                `;

                document.getElementById('game-modal-body').innerHTML = detailsHtml;

                // --- Check for and display existing summary ---
                const lang = localStorage.getItem('bgg_lang') || 'en';
                const summaryField = `summary_${lang}`;
                if (game[summaryField]) {
                    const summaryContainer = document.getElementById('ai-summary-container');
                    summaryContainer.innerHTML = `<p><strong>${translations.ai_summary_heading || 'AI Summary:'}</strong> ${game[summaryField]}</p>`;
                }
                // --- End summary check ---

                gameDetailsModal.show();
            }
        }
    });

    // --- API and AI Functions ---

    // Generate AI Summary
    document.getElementById('ai-summary-button').addEventListener('click', async () => {
        if (!currentlySelectedBggId) return;

        const summaryContainer = document.getElementById('ai-summary-container');
        summaryContainer.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Generating...</span></div>';

        const gameDoc = await gamesCollectionRef.doc(currentlySelectedBggId).get();
        if (!gameDoc.exists) {
            summaryContainer.innerHTML = '<p class="text-danger">Could not find game data.</p>';
            return;
        }
        const game = gameDoc.data();

        const lang = localStorage.getItem('bgg_lang') || 'en';
        const langName = lang === 'de' ? 'German' : 'English';
        const prompt = `You are a board game support bot. Provide a short, factual, and easy-to-understand summary of the board game "${game.name}". Focus on the theme and what players do mechanically in the game. Keep it to 2-3 sentences. Please reply only in ${langName}.`;

        try {
            const functionUrl = "https://us-central1-boardgameapp-cc741.cloudfunctions.net/generateAiSummary";
            const response = await fetch(functionUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: prompt })
            });

            if (!response.ok) {
                throw new Error(`Cloud Function error! Status: ${response.status}`);
            }

            const data = await response.json();
            const summary = data.summary;
            summaryContainer.innerHTML = `<p><strong>${translations.ai_summary_heading || 'AI Summary:'}</strong> ${summary}</p>`;

            // --- Save summary to Firestore ---
            const summaryField = `summary_${lang}`;
            await gamesCollectionRef.doc(currentlySelectedBggId).update({
                [summaryField]: summary
            });
            // --- End save summary ---

        } catch (error) {
            console.error("AI Summary Error:", error);
            summaryContainer.innerHTML = `<p class="text-danger">Failed to generate AI summary. Check the console for details.</p>`;
        }
    });


    // Add to Shortlist (Vote)
    gameCollectionContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('add-to-shortlist-button')) {
            const card = e.target.closest('.game-card');
            const bggId = card.dataset.bggId;
            const gameRef = shortlistCollectionRef.doc(bggId);
            // Admin: toggle shortlist entry from the collection view
            try {
                if (!currentUser) throw new Error('You must be logged in to shortlist.');
                const gameDoc = await gameRef.get();
                if (!gameDoc.exists) {
                    // If the game isn't on the shortlist, only the admin can create the shortlist entry
                    if (currentUser !== adminUser) throw new Error('Only the admin can add a game to the shortlist. Please ask the admin to add it.');
                    const fullGameDoc = await gamesCollectionRef.doc(bggId).get();
                    if (fullGameDoc.exists) {
                        await gameRef.set({ ...fullGameDoc.data(), voters: [], shortlistedBy: currentUser, shortlistedAt: firebase.firestore.FieldValue.serverTimestamp() });
                        // update button UI immediately to show shortlisted marker (not a vote)
                        try { e.target.classList.add('shortlisted'); e.target.textContent = 'Shortlisted ✓'; e.target.setAttribute('aria-pressed', 'false'); } catch(_){ }
                        alert(`${card.querySelector('.card-title').textContent} added to shortlist!`);
                    }
                } else {
                    // If already shortlisted, clicking as admin will remove the shortlist entry entirely
                    if (currentUser !== adminUser) {
                        // Non-admin should not see this button, but guard anyway
                        throw new Error('Only the admin can remove a game from the shortlist here.');
                    }
                    await gameRef.delete();
                    try { e.target.classList.remove('voted'); e.target.textContent = 'Shortlist'; e.target.setAttribute('aria-pressed', 'false'); } catch(_){}
                    alert(`${card.querySelector('.card-title').textContent} removed from shortlist.`);
                }
            } catch (error) {
                console.error('Error toggling shortlist from collection:', error);
                alert(error.message || 'Could not update shortlist.');
            }
        }
    });

    // Shortlist item actions: toggle user's vote
    shortlistGamesContainer.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('shortlist-toggle-button')) return;
        if (!currentUser) { alert('Please login to vote.'); return; }

        const bggId = e.target.dataset.bggId;
        const gameRef = shortlistCollectionRef.doc(bggId);

        // Read current voters and toggle
        try {
            await db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists) return; // nothing to toggle
                const voters = gameDoc.data().voters || [];
                if (voters.includes(currentUser)) {
                    // remove user
                    const newVoters = voters.filter(v => v !== currentUser);
                    if (newVoters.length === 0) {
                        // If this shortlist was created by admin (marker), keep the doc but clear voters.
                        if (gameDoc.data().shortlistedBy) {
                            transaction.update(gameRef, { voters: [] });
                        } else {
                            transaction.delete(gameRef);
                        }
                    } else {
                        transaction.update(gameRef, { voters: newVoters });
                    }
                } else {
                    // add user
                    transaction.update(gameRef, { voters: [...voters, currentUser] });
                }
            });
            // Toggle visual state and update text/title/aria for clarity; realtime snapshot will also update the button
            const votedNow = e.target.classList.toggle('voted');
            e.target.textContent = votedNow ? 'Voted ✓' : 'Vote';
            e.target.title = votedNow ? 'You have voted — click to remove your vote' : 'Click to vote for this game';
            e.target.setAttribute('aria-pressed', votedNow);
        } catch (err) {
            console.error('Error toggling shortlist vote:', err);
            alert('Could not update your shortlist vote.');
        }
    });

    // Admin: remove shortlist item (separate handler so we don't mix with vote toggle)
    shortlistGamesContainer.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('remove-shortlist-button')) return;
        if (currentUser !== adminUser) { alert('Only the admin can remove items from the shortlist.'); return; }
        const bggId = e.target.dataset.bggId;
        try {
            await shortlistCollectionRef.doc(bggId).delete();
            alert('Removed from shortlist.');
        } catch (err) {
            console.error('Error removing shortlist item:', err);
            alert('Could not remove shortlist item.');
        }
    });

    // Admin: Add to shortlist from wishlist summary
    document.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('wishlist-shortlist-btn')) return;
        if (currentUser !== adminUser) { alert('Only the admin can add to shortlist.'); return; }
        
        const bggId = e.target.dataset.bggId;
        const gameRef = shortlistCollectionRef.doc(bggId);
        
        try {
            const gameDoc = await gameRef.get();
            if (!gameDoc.exists) {
                // Add to shortlist (admin marker, no automatic vote)
                const fullGameDoc = await gamesCollectionRef.doc(bggId).get();
                if (fullGameDoc.exists) {
                    await gameRef.set({ ...fullGameDoc.data(), voters: [], shortlistedBy: currentUser, shortlistedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    e.target.classList.add('voted');
                    e.target.textContent = 'Shortlisted ✓';
                    e.target.setAttribute('aria-pressed', 'true');
                    alert('Added to shortlist!');
                }
            } else {
                // Remove from shortlist
                await gameRef.delete();
                e.target.classList.remove('voted');
                e.target.textContent = 'Shortlist';
                e.target.setAttribute('aria-pressed', 'false');
                alert('Removed from shortlist.');
            }
        } catch (err) {
            console.error('Error toggling shortlist from wishlist summary:', err);
            alert('Could not update shortlist.');
        }
    });

    // Admin: Upload Collection (Replaced with proxy fetch functionality)

        // Events: create and list
        async function fetchAndDisplayEvents() {
            const list = document.getElementById('events-list');
            list.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
            eventsCollectionRef.orderBy('date', 'asc').onSnapshot(snapshot => {
                if (snapshot.empty) {
                    list.innerHTML = `<p>${translations.no_events_yet || 'No events yet.'}</p>`;
                    return;
                }
                let html = '<div class="list-group">';
                snapshot.forEach(doc => {
                    const e = doc.data();
                    const when = e.date ? `${e.date} ${e.time || ''}` : (e.time || '');
                    const removeBtn = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-danger ms-2 remove-event-button" data-id="${doc.id}">Delete</button>` : '';
                    html += `<div class="list-group-item d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-bold">${e.title}</div>
                            <div class="text-muted">${when} — ${e.location || ''}</div>
                            <div class="small text-muted">Created by: ${e.createdBy || 'unknown'}</div>
                        </div>
                        <div>${removeBtn}</div>
                    </div>`;
                });
                html += '</div>';
                list.innerHTML = html;
            }, err => {
                console.error('Error fetching events:', err);
                list.innerHTML = '<p class="text-danger">Could not load events.</p>';
            });
        }

        // Create Event
        document.getElementById('save-event-button').addEventListener('click', async () => {
            if (!currentUser) { alert('Please login to create events.'); return; }
            const title = document.getElementById('event-title').value.trim();
            const date = document.getElementById('event-date').value;
            const time = document.getElementById('event-time').value;
            const location = document.getElementById('event-location').value.trim();
            if (!title || !date) { alert('Please provide a title and date.'); return; }
            try {
                await eventsCollectionRef.add({ title, date, time, location, createdBy: currentUser, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                // close modal
                const modalEl = document.getElementById('create-event-modal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                // clear inputs
                document.getElementById('event-title').value = '';
                document.getElementById('event-date').value = '';
                document.getElementById('event-time').value = '';
                document.getElementById('event-location').value = '';
            } catch (err) {
                console.error('Error creating event:', err);
                alert('Could not create event.');
            }
        });

        // Delete event (admin only)
        document.getElementById('events-list').addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-event-button')) {
                const id = e.target.dataset.id;
                try {
                    await eventsCollectionRef.doc(id).delete();
                } catch (err) {
                    console.error('Error deleting event:', err);
                    alert('Could not delete event.');
                }
            }
        });

    // Polls: Add Date Option
    addPollOptionButton.addEventListener('click', () => {
        const optionCount = pollOptionsContainer.children.length;
        const inputGroup = document.createElement('div');
        inputGroup.classList.add('input-group', 'mb-2');
        inputGroup.innerHTML = `
            <input type="date" class="form-control poll-date-input" placeholder="Date option">
            <button class="btn btn-outline-danger remove-poll-option" type="button">-</button>
        `;
        pollOptionsContainer.appendChild(inputGroup);

        // Add event listener for removing option
        inputGroup.querySelector('.remove-poll-option').addEventListener('click', (e) => {
            e.target.closest('.input-group').remove();
        });
    });

    // Polls: Create Poll
    savePollButton.addEventListener('click', async () => {
        if (!currentUser || currentUser !== adminUser) { alert('Only the admin can create polls.'); return; }

        const pollTitle = document.getElementById('poll-title').value.trim();
        const dateInputs = pollOptionsContainer.querySelectorAll('.poll-date-input');
        const pollOptions = Array.from(dateInputs)
                                .map(input => input.value.trim())
                                .filter(date => date !== '');

        if (!pollTitle) { alert('Please provide a poll title.'); return; }
        if (pollOptions.length === 0) { alert('Please add at least one date option.'); return; }

        const optionsWithVotes = pollOptions.map(option => ({ date: option, voters: [] }));

        try {
            await pollsCollectionRef.add({
                title: pollTitle,
                options: optionsWithVotes,
                createdBy: currentUser,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert('Poll created successfully!');
            createPollModal.hide();
            // Clear form
            document.getElementById('poll-title').value = '';
            pollOptionsContainer.innerHTML = '';
            fetchAndDisplayPolls(); // Refresh polls list
        } catch (err) {
            console.error('Error creating poll:', err);
            alert('Could not create poll.');
        }
    });

    // Polls: Fetch and Display
    async function fetchAndDisplayPolls() {
        pollsListContainer.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
        pollsCollectionRef.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            if (snapshot.empty) {
                pollsListContainer.innerHTML = `<p>${translations.no_polls_yet || 'No polls yet.'}</p>`;
                return;
            }
            let html = '<div class="list-group">';
            snapshot.forEach(doc => {
                const poll = doc.data();
                const pollId = doc.id;
                const userHasVotedInPoll = currentUser && poll.options.some(opt => opt.voters.includes(currentUser));
                const adminControls = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-danger ms-2 remove-poll-button" data-poll-item-id="${pollId}">Delete Poll</button>` : '';

                html += `<div class="list-group-item mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h5 class="mb-0">${poll.title}</h5>
                        <div>
                            <small class="text-muted me-2">Created by: ${poll.createdBy || 'unknown'}</small>
                            ${adminControls}
                        </div>
                    </div>
                    <div class="poll-options">`;

                poll.options.forEach((option, index) => {
                    const optionId = `poll-${pollId}-option-${index}`;
                    const isVotedByCurrentUser = currentUser && option.voters.includes(currentUser);
                    const voteBtnClass = isVotedByCurrentUser ? 'btn-primary' : 'btn-outline-primary';
                    const voteCount = option.voters.length;
                    // Add day of the week
                    const dateObj = new Date(option.date + 'T00:00:00'); // Ensure date is parsed correctly in local timezone
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayOfWeek = days[dateObj.getDay()];

                    html += `<div class="d-flex align-items-center flex-wrap mb-1">
                        <button class="btn btn-sm ${voteBtnClass} me-2 vote-for-option" data-poll-id="${pollId}" data-option-index="${index}" ${!currentUser ? 'disabled' : ''}>
                            ${isVotedByCurrentUser ? '✓ Voted' : 'Vote'}
                        </button>
                        <span>${dayOfWeek}, ${option.date}</span>
                        <span class="ms-auto badge bg-secondary">${voteCount} votes</span>
                    </div>`;
                });

                html += `</div></div>`;
            });
            html += '</div>';
            pollsListContainer.innerHTML = html;
        }, err => {
            console.error('Error fetching polls:', err);
            pollsListContainer.innerHTML = '<p class="text-danger">Could not load polls.</p>';
        });
    }

    // Polls: Handle Voting
    pollsListContainer.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('vote-for-option')) return;
        if (!currentUser) { alert('Please login to vote.'); return; }

        const pollId = e.target.dataset.pollId;
        const optionIndex = parseInt(e.target.dataset.optionIndex);
        const pollRef = pollsCollectionRef.doc(pollId);

        try {
            await db.runTransaction(async (transaction) => {
                const pollDoc = await transaction.get(pollRef);
                if (!pollDoc.exists) return; // Poll deleted or not found

                const poll = pollDoc.data();
                let options = poll.options;

                const selectedOption = options[optionIndex];

                if (selectedOption.voters.includes(currentUser)) {
                    // If user has already voted for this option, remove their vote
                    selectedOption.voters = selectedOption.voters.filter(voter => voter !== currentUser);
                } else {
                    // If user has not voted for this option, add their vote
                    selectedOption.voters.push(currentUser);
                }

                transaction.update(pollRef, { options: options });
            });
            fetchAndDisplayPolls(); // Refresh UI
        } catch (err) {
            console.error('Error voting on poll:', err);
            alert('Could not cast your vote.');
        }
    });

    // Polls: Delete Poll (Admin only)
    pollsListContainer.addEventListener('click', async (e) => {
        console.log('Click event on pollsListContainer', e.target);
        if (!e.target.classList.contains('remove-poll-button')) return;
        console.log('Remove poll button clicked');
        if (currentUser !== adminUser) { alert('Only the admin can delete polls.'); return; }

        const pollId = e.target.dataset.pollItemId;
        console.log('Poll ID to delete:', pollId);

        try {
            await pollsCollectionRef.doc(pollId).delete();
            alert('Poll deleted successfully.');
            // No need to call fetchAndDisplayPolls() here, onSnapshot will handle it
        } catch (err) {
            console.error('Error deleting poll:', err);
            alert('Could not delete poll.');
        }
    });

    // Fetch usernames from Firebase and populate dropdown
    async function fetchUsernames() {
        console.log('Attempting to fetch usernames...');
        if (!existingUsersDropdown) {
            console.error('Error: existingUsersDropdown element not found.');
            return;
        }

        try {
            const snapshot = await usersCollectionRef.get();
            existingUsersDropdown.innerHTML = '<option value="">--- Select existing user ---</option>';
            const usernames = [];
            snapshot.forEach(doc => {
                usernames.push(doc.id);
            });
            usernames.sort(); // Sort alphabetically
            console.log(`Found ${usernames.length} usernames:`, usernames);

            usernames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                existingUsersDropdown.appendChild(option);
            });

            // Always show the dropdown, but it will be empty if no non-admin users exist
            existingUsersDropdown.classList.remove('d-none');
            console.log('existingUsersDropdown should now be visible.');
        } catch (err) {
            console.error('Error fetching usernames:', err);
        }
    }

    // Admin: Fetch and Display Users
    async function fetchAndDisplayUsers() {
        if (!userListContainer) return;
        userListContainer.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading users...</span></div>';
        try {
            const snapshot = await usersCollectionRef.orderBy('createdAt', 'asc').get();
            if (snapshot.empty) {
                userListContainer.innerHTML = '<p>No registered users yet.</p>';
                return;
            }
            let html = '';
            snapshot.forEach(doc => {
                const username = doc.id;
                if (username === adminUser) return; // Don't allow deleting the admin user
                html += `<div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${username}</span>
                    <button class="btn btn-sm btn-outline-danger delete-user-button" data-username="${username}">Delete</button>
                </div>`;
            });
            userListContainer.innerHTML = html;
        } catch (err) {
            console.error('Error fetching users:', err);
            userListContainer.innerHTML = '<p class="text-danger">Could not load users.</p>';
        }
    }

    // Admin: Delete User (and their data)
    if (userListContainer) {
        userListContainer.addEventListener('click', async (e) => {
            console.log('User list container click event', e.target);
            if (!e.target.classList.contains('delete-user-button')) return;
            console.log('Delete user button clicked');
            if (currentUser !== adminUser) { alert('Only the admin can delete users.'); return; }
    
            const usernameToDelete = e.target.dataset.username;
            console.log('Username to delete:', usernameToDelete);
            if (!usernameToDelete) return;

            try {
                console.log('Initiating Firebase transaction to delete user:', usernameToDelete);
                // Fetch all polls BEFORE the transaction starts, as transaction.get() is for documents
                const pollsSnapshot = await pollsCollectionRef.get();
                console.log('Fetched polls snapshot before transaction.');

                await db.runTransaction(async (transaction) => {
                    // 1. Delete user's wishlist/favorites
                    console.log('Deleting user wishlist for:', usernameToDelete);
                    const userWishlistRef = userWishlistsCollectionRef.doc(usernameToDelete);
                    transaction.delete(userWishlistRef);
    
                    // 2. Remove user's votes from all polls
                    console.log('Removing user votes from polls for:', usernameToDelete);
                    pollsSnapshot.forEach(pollDoc => {
                        const pollRef = pollsCollectionRef.doc(pollDoc.id);
                        const pollData = pollDoc.data();
                        if (pollData.options) {
                            const updatedOptions = pollData.options.map(option => ({
                                ...option,
                                voters: option.voters.filter(voter => voter !== usernameToDelete)
                            }));
                            transaction.update(pollRef, { options: updatedOptions });
                        }
                    });
    
                    // 3. Delete the user record itself
                    console.log('Deleting user record for:', usernameToDelete);
                    const userRef = usersCollectionRef.doc(usernameToDelete);
                    transaction.delete(userRef);
                });

                console.log(`User '${usernameToDelete}' and all associated data deleted.`);
                alert(`User '${usernameToDelete}' and all associated data deleted.`);
                fetchUsernames(); // Refresh login dropdown
                fetchAndDisplayUsers(); // Refresh admin user list
            } catch (err) {
                console.error('Error deleting user:', err);
                alert('Could not delete user.');
            }
        });
    }

    // Modify updateUserDisplay to call fetchAndDisplayUsers when admin logs in
    // --- App Initialization ---
    updateUserDisplay();
    handleHashChange(); // Handle initial load based on URL hash

    // Initial fetch for polls when events view might be active or navigated to
    // This is now handled by handleHashChange and showView functions

    // Ensure polls are fetched when navigating to events view
    // This is now handled by showView function

    // --- Localization Initialization ---
    const languageSwitcher = document.getElementById('language-switcher');
    languageSwitcher.addEventListener('change', (e) => {
        const lang = e.target.value;
        localStorage.setItem('bgg_lang', lang);
        loadTranslations(lang);
    });

    const savedLang = localStorage.getItem('bgg_lang') || 'en';
    languageSwitcher.value = savedLang;
    loadTranslations(savedLang); // Load translations after initial setup
});
