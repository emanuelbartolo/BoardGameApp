document.addEventListener('DOMContentLoaded', () => {
    // Soft login state
    let currentUser = localStorage.getItem('bgg_username');
    let shortlist = JSON.parse(localStorage.getItem('bgg_shortlist')) || [];
    let polls = JSON.parse(localStorage.getItem('bgg_polls')) || [];
    let events = JSON.parse(localStorage.getItem('bgg_events')) || [];

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

    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.add('d-none'));
        views[viewName].classList.remove('d-none');
        Object.values(navLinks).forEach(link => link.classList.remove('active'));
        if (navLinks[viewName]) {
            navLinks[viewName].classList.add('active');
        }
        if (viewName === 'shortlist') {
            renderShortlist();
        }
        if (viewName === 'polls') {
            renderPolls();
        }
        if (viewName === 'events') {
            renderEvents();
        }
    }

    function updateUserDisplay() {
        if (currentUser) {
            userDisplay.textContent = `Logged in as: ${currentUser}`;
            document.getElementById('bgg-username-input').value = currentUser;
        } else {
            userDisplay.textContent = 'Not logged in';
        }
    }

    function renderShortlist() {
        const shortlistContainer = document.getElementById('shortlist-games');
        shortlistContainer.innerHTML = '';
        shortlist.forEach(game => {
            const gameCard = `
                <div class="col-md-3 mb-4">
                    <div class="card" data-bgg-id="${game.bggId}">
                        <img src="${game.image}" class-img-top" alt="${game.name}">
                        <div class="card-body">
                            <h5 class="card-title">${game.name}</h5>
                            <p class="card-text">${game.year || ''}</p>
                            <button class="btn btn-sm btn-danger remove-from-shortlist-button">Remove</button>
                        </div>
                    </div>
                </div>
            `;
            shortlistContainer.insertAdjacentHTML('beforeend', gameCard);
        });
    }

    function renderPolls() {
        const pollsListContainer = document.getElementById('polls-list');
        pollsListContainer.innerHTML = '';
        polls.forEach((poll, index) => {
            const pollCard = `
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">${poll.title}</h5>
                        <div class="poll-options">
                            ${poll.games.map(game => `
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="poll-${index}" id="poll-${index}-game-${game.bggId}" value="${game.bggId}">
                                    <label class="form-check-label" for="poll-${index}-game-${game.bggId}">
                                        ${game.name}
                                    </label>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-sm btn-primary mt-2 vote-button" data-poll-index="${index}">Vote</button>
                    </div>
                </div>
            `;
            pollsListContainer.insertAdjacentHTML('beforeend', pollCard);
        });
    }

    function renderEvents() {
        const eventsListContainer = document.getElementById('events-list');
        eventsListContainer.innerHTML = '';
        events.forEach((event, index) => {
            const eventCard = `
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">${event.title}</h5>
                        <p class="card-text"><strong>Date:</strong> ${event.date}</p>
                        <p class="card-text"><strong>Time:</strong> ${event.time}</p>
                        <p class="card-text"><strong>Location:</strong> ${event.location}</p>
                        <button class="btn btn-sm btn-secondary download-ics-button" data-event-index="${index}">Download .ics</button>
                        <button class="btn btn-sm btn-info share-event-button" data-event-index="${index}">Share</button>
                    </div>
                </div>
            `;
            eventsListContainer.insertAdjacentHTML('beforeend', eventCard);
        });
    }

    // Login
    document.getElementById('login-button').addEventListener('click', () => {
        const username = document.getElementById('username-input').value.trim();
        if (username) {
            currentUser = username;
            localStorage.setItem('bgg_username', username);
            updateUserDisplay();
            showView('collection');
        }
    });

    // Navigation
    navLinks.collection.addEventListener('click', (e) => { e.preventDefault(); showView('collection'); });
    navLinks.shortlist.addEventListener('click', (e) => { e.preventDefault(); showView('shortlist'); });
    navLinks.polls.addEventListener('click', (e) => { e.preventDefault(); showView('polls'); });
    navLinks.events.addEventListener('click', (e) => { e.preventDefault(); showView('events'); });

    // Initial state
    updateUserDisplay();
    if (currentUser) {
        showView('collection');
    } else {
        showView('login');
    }

    // BGG Collection Sync
    document.getElementById('sync-bgg-button').addEventListener('click', async () => {
        const username = document.getElementById('bgg-username-input').value.trim();
        if (!username) {
            alert('Please enter a BGG username.');
            return;
        }
        
        const collectionContainer = document.getElementById('bgg-collection');
        collectionContainer.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>'; // Loading spinner

        try {
            const games = await fetchBggCollection(username);
            collectionContainer.innerHTML = ''; // Clear spinner

            if (games.length === 0) {
                collectionContainer.innerHTML = '<p>No games found in collection.</p>';
                return;
            }

            games.forEach(game => {
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
                collectionContainer.insertAdjacentHTML('beforeend', gameCard);
            });
        } catch (error) {
            collectionContainer.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    });

    // Add to shortlist
    document.getElementById('bgg-collection').addEventListener('click', (e) => {
        if (e.target.classList.contains('add-to-shortlist-button')) {
            const card = e.target.closest('.game-card');
            const game = {
                bggId: card.dataset.bggId,
                name: card.querySelector('.card-title').textContent,
                year: card.querySelector('.card-text').textContent,
                image: card.querySelector('img').src,
            };

            if (!shortlist.find(g => g.bggId === game.bggId)) {
                shortlist.push(game);
                localStorage.setItem('bgg_shortlist', JSON.stringify(shortlist));
                alert(`${game.name} added to shortlist!`);
            } else {
                alert(`${game.name} is already on the shortlist.`);
            }
        }
    });

    // Create Poll Modal
    document.getElementById('create-poll-button').addEventListener('click', () => {
        const pollGamesOptions = document.getElementById('poll-games-options');
        pollGamesOptions.innerHTML = '';
        shortlist.forEach(game => {
            const option = `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${game.bggId}" id="game-${game.bggId}">
                    <label class="form-check-label" for="game-${game.bggId}">
                        ${game.name}
                    </label>
                </div>
            `;
            pollGamesOptions.insertAdjacentHTML('beforeend', option);
        });
    });

    // Save Poll
    document.getElementById('save-poll-button').addEventListener('click', () => {
        const title = document.getElementById('poll-title').value.trim();
        if (!title) {
            alert('Please enter a poll title.');
            return;
        }

        const selectedGames = [];
        document.querySelectorAll('#poll-games-options input[type=checkbox]:checked').forEach(checkbox => {
            const game = shortlist.find(g => g.bggId === checkbox.value);
            if (game) {
                selectedGames.push(game);
            }
        });

        if (selectedGames.length === 0) {
            alert('Please select at least one game for the poll.');
            return;
        }

        const newPoll = { title, games: selectedGames };
        polls.push(newPoll);
        localStorage.setItem('bgg_polls', JSON.stringify(polls));
        renderPolls();

        const modal = bootstrap.Modal.getInstance(document.getElementById('create-poll-modal'));
        modal.hide();
    });

    // Create Event Modal
    document.getElementById('create-event-button').addEventListener('click', () => {
        const modal = new bootstrap.Modal(document.getElementById('create-event-modal'));
        modal.show();
    });

    // Save Event
    document.getElementById('save-event-button').addEventListener('click', () => {
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;
        const time = document.getElementById('event-time').value;
        const location = document.getElementById('event-location').value.trim();

        if (!title || !date || !time) {
            alert('Please fill in all event details.');
            return;
        }

        const newEvent = { title, date, time, location };
        events.push(newEvent);
        localStorage.setItem('bgg_events', JSON.stringify(events));
        renderEvents();

        const modal = bootstrap.Modal.getInstance(document.getElementById('create-event-modal'));
        modal.hide();
    });

    // Event Actions (ICS and Share)
    document.getElementById('events-list').addEventListener('click', (e) => {
        const eventIndex = e.target.dataset.eventIndex;
        if (eventIndex === undefined) return;

        const event = events[eventIndex];

        if (e.target.classList.contains('download-ics-button')) {
            const cal = ics();
            cal.addEvent(event.title, `Board game night at ${event.location}`, event.location, `${event.date} ${event.time}`, `${event.date} ${event.time}`);
            cal.download(event.title);
        }

        if (e.target.classList.contains('share-event-button')) {
            const shareData = {
                title: 'Board Game Night',
                text: `Let's play board games on ${event.date} at ${event.time} at ${event.location}!`,
            };
            if (navigator.share) {
                navigator.share(shareData)
                    .then(() => console.log('Successful share'))
                    .catch((error) => console.log('Error sharing', error));
            } else {
                // Fallback for browsers that don't support Web Share API
                const shareText = `${shareData.title}\n${shareData.text}`;
                navigator.clipboard.writeText(shareText).then(() => {
                    alert('Event details copied to clipboard!');
                });
            }
        }
    });

    // Vote
    document.getElementById('polls-list').addEventListener('click', (e) => {
        const pollIndex = e.target.dataset.pollIndex;
        if (pollIndex === undefined) return;

        const poll = polls[pollIndex];

        if (e.target.classList.contains('vote-button')) {
            const selectedOption = document.querySelector(`input[name="poll-${pollIndex}"]:checked`);
            if (!selectedOption) {
                alert('Please select an option before voting.');
                return;
            }

            const selectedGameId = selectedOption.value;
            const selectedGame = poll.games.find(game => game.bggId === selectedGameId);

            if (selectedGame) {
                alert(`You voted for ${selectedGame.name} in the poll "${poll.title}"`);
            } else {
                alert('Error: Selected game not found in the poll.');
            }
        }
    });

    // Remove from shortlist
    document.getElementById('shortlist-games').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-from-shortlist-button')) {
            const card = e.target.closest('.card');
            const bggId = card.dataset.bggId;
            shortlist = shortlist.filter(game => game.bggId !== bggId);
            localStorage.setItem('bgg_shortlist', JSON.stringify(shortlist));
            renderShortlist();
            alert('Game removed from shortlist.');
        }
    });
});
