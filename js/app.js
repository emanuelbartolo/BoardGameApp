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

    // --- Core Functions ---

    function showView(viewName) {
        Object.values(views).forEach(view => view && view.classList.add('d-none'));
        if (views[viewName]) {
            views[viewName].classList.remove('d-none');
        }
        Object.values(navLinks).forEach(link => link && link.classList.remove('active'));
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        }
    }

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
                <span class="me-2">Logged in as: <strong>${currentUser}</strong></span>
                <button class="btn btn-sm btn-outline-secondary" id="logout-button">Logout</button>
            `;
            // Show admin panel if the current user is the admin
            if (adminPanel) {
                if (currentUser === adminUser) {
                    adminPanel.classList.remove('d-none');
                    // Load admin wishlist summary
                    loadWishlistSummary();
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
        } else {
            userDisplay.innerHTML = '<span>Not logged in</span>';
            if (adminPanel) {
                adminPanel.classList.add('d-none');
            }
            if (wishlistFilterButton) {
                wishlistFilterButton.classList.add('d-none');
            }
            const createEventBtn = document.getElementById('create-event-button');
            if (createEventBtn) createEventBtn.classList.add('d-none');
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
            fetchAndDisplayGames();
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
    document.getElementById('username-input').addEventListener('input', (e) => {
        const passwordField = document.getElementById('password-field');
        if (e.target.value.toLowerCase() === adminUser) {
            passwordField.classList.remove('d-none');
        } else {
            passwordField.classList.add('d-none');
        }
    });

    // Login
    document.getElementById('login-button').addEventListener('click', async () => {
        const username = document.getElementById('username-input').value.trim();
        if (!username) {
            alert("Please enter a username.");
            return;
        }

        // Admin Login
        if (username.toLowerCase() === adminUser) {
            // IMPORTANT: This is a simple, hardcoded password for demonstration.
            // For a real application, use a secure authentication system like Firebase Auth.
            const password = document.getElementById('password-input').value;
            if (password === 'bgg') { // You can change this password
                currentUser = adminUser;
                localStorage.setItem('bgg_username', adminUser);
                updateUserDisplay();
                showView('collection');
                await loadUserWishlist();
                fetchAndDisplayGames();
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
    navLinks.login.addEventListener('click', (e) => { e.preventDefault(); showView('login'); });
    navLinks.collection.addEventListener('click', (e) => { e.preventDefault(); showView('collection'); });
    navLinks.shortlist.addEventListener('click', (e) => { 
        e.preventDefault(); 
        showView('shortlist');
        fetchAndDisplayShortlist(); // Fetch shortlist when view is shown
    });
    navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); showView('admin'); });
    navLinks.events.addEventListener('click', (e) => { e.preventDefault(); showView('events'); fetchAndDisplayEvents(); });

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
                
                document.getElementById('game-modal-body').innerHTML = `
                    <div class="row">
                        <div class="col-md-4">
                            <img src="${game.image}" class="img-fluid rounded" alt="${game.name}">
                        </div>
                        <div class="col-md-8">
                            <p><strong>Players:</strong> ${game.minPlayers} - ${game.maxPlayers}</p>
                            <p><strong>Play Time:</strong> ${game.playingTime} min</p>
                            <p><strong>Rating:</strong> ${game.rating} / 10</p>
                            <p><strong>Year Published:</strong> ${game.year || 'N/A'}</p>
                            <p><strong>BGG ID:</strong> ${game.bggId}</p>
                            <hr>
                            <div id="ai-summary-container"></div>
                        </div>
                    </div>
                `;
                gameDetailsModal.show();
            }
        }
    });

    // --- API and AI Functions ---

    // Save API Key
    document.getElementById('save-api-key-button').addEventListener('click', () => {
        const apiKey = document.getElementById('api-key-input').value.trim();
        if (apiKey) {
            localStorage.setItem('openrouter_api_key', apiKey);
            alert('API Key saved successfully!');
            document.getElementById('api-key-input').value = '';
        } else {
            alert('Please enter an API key.');
        }
    });

    // Generate AI Summary
    document.getElementById('ai-summary-button').addEventListener('click', async () => {
        const apiKey = localStorage.getItem('openrouter_api_key');
        if (!apiKey) {
            alert('Please save your OpenRouter API key in the Admin Controls section first.');
            return;
        }

        if (!currentlySelectedBggId) return;

        const summaryContainer = document.getElementById('ai-summary-container');
        summaryContainer.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Generating...</span></div>';

        const gameDoc = await gamesCollectionRef.doc(currentlySelectedBggId).get();
        if (!gameDoc.exists) {
            summaryContainer.innerHTML = '<p class="text-danger">Could not find game data.</p>';
            return;
        }
        const game = gameDoc.data();

        const prompt = `You are a board game support bot. Provide a short, factual, and easy-to-understand summary of the board game "${game.name}". Focus on the theme and what players do mechanically in the game. Keep it to 2-3 sentences.`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": "google/gemma-3-27b-it:free", // A fast and cheap model
                    "messages": [
                        { "role": "user", "content": prompt }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`OpenRouter API error! Status: ${response.status}`);
            }

            const data = await response.json();
            const summary = data.choices[0].message.content;
            summaryContainer.innerHTML = `<p><strong>AI Summary:</strong> ${summary}</p>`;

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
        if (!confirm('Remove this game from the shortlist?')) return;
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

    // Admin: Upload Collection
    document.getElementById('upload-collection-button').addEventListener('click', () => {
        const fileInput = document.getElementById('xml-file-input');
        const statusDiv = document.getElementById('upload-status');
        
        if (fileInput.files.length === 0) {
            statusDiv.innerHTML = '<p class="text-danger">Please select a file first.</p>';
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                statusDiv.innerHTML = '<p class="text-info">Parsing XML...</p>';
                const games = parseBggXml(e.target.result);
                
                statusDiv.innerHTML = `<p class="text-info">Found ${games.length} games. Deleting old collection from Firebase...</p>`;
                
                // To delete the old collection, we must fetch all documents and delete them.
                const oldGamesSnapshot = await gamesCollectionRef.get();
                const batchDelete = db.batch();
                oldGamesSnapshot.forEach(doc => batchDelete.delete(doc.ref));
                await batchDelete.commit();

                statusDiv.innerHTML = `<p class="text-info">Uploading ${games.length} new games to Firebase...</p>`;

                // Upload new collection in a new batch to avoid exceeding limits.
                const batchWrite = db.batch();
                games.forEach(game => {
                    const docRef = gamesCollectionRef.doc(game.bggId); // Use BGG ID as the document ID
                    batchWrite.set(docRef, game);
                });
                await batchWrite.commit();

                statusDiv.innerHTML = '<p class="text-success">Collection uploaded successfully!</p>';
                fetchAndDisplayGames(); // Refresh the view with the new data

            } catch (error) {
                console.error("Upload error:", error);
                statusDiv.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
            }
        };

        reader.onerror = () => {
            statusDiv.innerHTML = '<p class="text-danger">Failed to read the file.</p>';
        };

        reader.readAsText(file);
    });

        // Events: create and list
        async function fetchAndDisplayEvents() {
            const list = document.getElementById('events-list');
            list.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
            eventsCollectionRef.orderBy('date', 'asc').onSnapshot(snapshot => {
                if (snapshot.empty) {
                    list.innerHTML = '<p>No events yet.</p>';
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
                if (!confirm('Delete this event?')) return;
                try {
                    await eventsCollectionRef.doc(id).delete();
                } catch (err) {
                    console.error('Error deleting event:', err);
                    alert('Could not delete event.');
                }
            }
        });

    // --- App Initialization ---
    updateUserDisplay();
    if (currentUser) {
        showView('collection');
        applyLayout(currentLayout); // Apply saved layout on load
        loadUserWishlist().then(() => fetchAndDisplayGames());
    } else {
        showView('login');
    }
});
