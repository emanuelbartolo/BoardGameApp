document.addEventListener('DOMContentLoaded', () => {
    // --- App State ---
    let currentUser = localStorage.getItem('bgg_username');
    const adminUser = 'leli84'; // The designated admin

    // --- DOM Elements ---
    const views = {
        login: document.getElementById('login-view'),
        collection: document.getElementById('collection-view'),
        shortlist: document.getElementById('shortlist-view'),
        polls: document.getElementById('polls-view'),
        events: document.getElementById('events-view'),
    };

    const navLinks = {
        collection: document.getElementById('nav-collection'),
        shortlist: document.getElementById('nav-shortlist'),
        polls: document.getElementById('nav-polls'),
        events: document.getElementById('nav-events'),
    };

    const userDisplay = document.getElementById('user-display');
    const adminPanel = document.getElementById('admin-panel');
    const gameCollectionContainer = document.getElementById('game-collection');

    // --- Firebase Refs ---
    const db = firebase.firestore();
    const gamesCollectionRef = db.collection('games');

    // --- Core Functions ---

    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.add('d-none'));
        views[viewName].classList.remove('d-none');
        Object.values(navLinks).forEach(link => link.classList.remove('active'));
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        }
    }

    function updateUserDisplay() {
        if (currentUser) {
            userDisplay.innerHTML = `
                <span class="me-2">Logged in as: <strong>${currentUser}</strong></span>
                <button class="btn btn-sm btn-outline-secondary" id="logout-button">Logout</button>
            `;
            // Show admin panel if the current user is the admin
            if (currentUser === adminUser) {
                adminPanel.classList.remove('d-none');
            } else {
                adminPanel.classList.add('d-none');
            }
        } else {
            userDisplay.innerHTML = '<span>Not logged in</span>';
            adminPanel.classList.add('d-none');
        }
    }

    async function fetchAndDisplayGames() {
        gameCollectionContainer.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
        
        try {
            const snapshot = await gamesCollectionRef.orderBy('name').get();
            gameCollectionContainer.innerHTML = ''; // Clear spinner
            
            if (snapshot.empty) {
                gameCollectionContainer.innerHTML = '<p>No games in the collection yet. The admin needs to upload a BGG collection file.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const game = doc.data();
                const gameCard = `
                    <div class="col-md-3 mb-4">
                        <div class="card game-card" data-bgg-id="${game.bggId}">
                            <img src="${game.image}" class="card-img-top" alt="${game.name}">
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <p class="card-text">${game.year || ''}</p>
                                <button class="btn btn-sm btn-primary add-to-shortlist-button">Add to Shortlist</button>
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

    // Login
    document.getElementById('login-button').addEventListener('click', () => {
        const username = document.getElementById('username-input').value.trim();
        if (username) {
            currentUser = username;
            localStorage.setItem('bgg_username', username);
            updateUserDisplay();
            showView('collection');
            fetchAndDisplayGames(); // Fetch games on login
        }
    });

    // Logout
    userDisplay.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'logout-button') {
            currentUser = null;
            localStorage.removeItem('bgg_username');
            updateUserDisplay();
            showView('login');
            gameCollectionContainer.innerHTML = ''; // Clear the games list on logout
        }
    });

    // Navigation
    navLinks.collection.addEventListener('click', (e) => { e.preventDefault(); showView('collection'); });
    // Note: Shortlist, Polls, and Events still use localStorage and would need to be refactored to use Firebase
    // for a fully multi-user experience.
    navLinks.shortlist.addEventListener('click', (e) => { e.preventDefault(); alert('Shortlist feature not yet migrated to Firebase.'); });
    navLinks.polls.addEventListener('click', (e) => { e.preventDefault(); alert('Polls feature not yet migrated to Firebase.'); });
    navLinks.events.addEventListener('click', (e) => { e.preventDefault(); alert('Events feature not yet migrated to Firebase.'); });

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

    // --- App Initialization ---
    updateUserDisplay();
    if (currentUser) {
        showView('collection');
        fetchAndDisplayGames(); // Fetch games on initial load
    } else {
        showView('login');
    }
});
