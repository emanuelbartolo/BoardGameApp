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
        login: document.getElementById('nav-login'),
    };

    const userDisplay = document.getElementById('user-display');
    const adminPanel = document.getElementById('admin-panel');
    const gameCollectionContainer = document.getElementById('game-collection');
    const shortlistGamesContainer = document.getElementById('shortlist-games');

    // --- Firebase Refs ---
    const db = firebase.firestore();
    const gamesCollectionRef = db.collection('games');
    const shortlistCollectionRef = db.collection('shortlist');

    // --- Core Functions ---

    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.add('d-none'));
        views[viewName].classList.remove('d-none');
        Object.values(navLinks).forEach(link => link.classList.remove('active'));
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        }
    }

    function updateUserNav() {
        if (currentUser) {
            // User is logged in: show app nav, hide login nav
            navLinks.collection.parentElement.classList.remove('d-none');
            navLinks.shortlist.parentElement.classList.remove('d-none');
            navLinks.polls.parentElement.classList.remove('d-none');
            navLinks.events.parentElement.classList.remove('d-none');
            navLinks.login.parentElement.classList.add('d-none');
        } else {
            // User is logged out: hide app nav, show login nav
            navLinks.collection.parentElement.classList.add('d-none');
            navLinks.shortlist.parentElement.classList.add('d-none');
            navLinks.polls.parentElement.classList.add('d-none');
            navLinks.events.parentElement.classList.add('d-none');
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
            if (currentUser === adminUser) {
                adminPanel.classList.remove('d-none');
            } else {
                adminPanel.classList.add('d-none');
            }
        } else {
            userDisplay.innerHTML = '<span>Not logged in</span>';
            adminPanel.classList.add('d-none');
        }
        updateUserNav(); // Update nav visibility along with user display
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
                const gameCard = `
                    <div class="col-md-3 mb-4">
                        <div class="card" data-bgg-id="${game.bggId}">
                            <img src="${game.image}" class="card-img-top" alt="${game.name}">
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <p class="card-text">${game.year || ''}</p>
                                <div class="d-flex justify-content-between align-items-center">
                                    <button class="btn btn-sm btn-danger remove-from-shortlist-button">Remove Vote</button>
                                    <span class="badge bg-primary" title="${(game.voters || []).join(', ')}">
                                        ${game.voters ? game.voters.length : 0} votes
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
    document.getElementById('login-button').addEventListener('click', () => {
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
    // Note: Polls and Events still use localStorage and would need to be refactored to use Firebase
    navLinks.polls.addEventListener('click', (e) => { e.preventDefault(); alert('Polls feature not yet migrated to Firebase.'); });
    navLinks.events.addEventListener('click', (e) => { e.preventDefault(); alert('Events feature not yet migrated to Firebase.'); });

    // Add to Shortlist (from main collection)
    gameCollectionContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('add-to-shortlist-button')) {
            const card = e.target.closest('.game-card');
            const bggId = card.dataset.bggId;
            const gameRef = shortlistCollectionRef.doc(bggId);

            // Use a transaction to safely update the voters list
            db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists) {
                    // If the game isn't on the shortlist, add it with the current user as the first voter
                    const fullGameDoc = await gamesCollectionRef.doc(bggId).get();
                    if (fullGameDoc.exists) {
                        const newShortlistGame = { ...fullGameDoc.data(), voters: [currentUser] };
                        transaction.set(gameRef, newShortlistGame);
                    }
                } else {
                    // If the game is already on the shortlist, add the user to the voters array
                    const voters = gameDoc.data().voters || [];
                    if (!voters.includes(currentUser)) {
                        transaction.update(gameRef, { voters: [...voters, currentUser] });
                    }
                }
            }).then(() => {
                alert(`${card.querySelector('.card-title').textContent} added to shortlist!`);
            }).catch(error => {
                console.error("Error adding to shortlist: ", error);
                alert("Could not add game to shortlist.");
            });
        }
    });

    // Remove from Shortlist (removes a user's vote)
    shortlistGamesContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-from-shortlist-button')) {
            const card = e.target.closest('.card');
            const bggId = card.dataset.bggId;
            const gameRef = shortlistCollectionRef.doc(bggId);

            // Use a transaction to safely update the voters list
            db.runTransaction(async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists) return;

                let voters = gameDoc.data().voters || [];
                voters = voters.filter(voter => voter !== currentUser); // Remove current user

                if (voters.length === 0) {
                    // If no voters are left, remove the game from the shortlist
                    transaction.delete(gameRef);
                } else {
                    // Otherwise, just update the voters list
                    transaction.update(gameRef, { voters: voters });
                }
            }).catch(error => {
                console.error("Error removing vote: ", error);
                alert("Could not remove vote from shortlist.");
            });
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

    // --- App Initialization ---
    updateUserDisplay();
    if (currentUser) {
        showView('collection');
        fetchAndDisplayGames(); // Fetch games on initial load
    } else {
        showView('login');
    }
});
