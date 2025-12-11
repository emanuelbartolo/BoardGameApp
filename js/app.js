document.addEventListener('DOMContentLoaded', () => {
    // --- App State ---
    let currentUser = localStorage.getItem('bgg_username');
    const adminUser = 'Emanuel'; // The designated admin
    let currentLayout = localStorage.getItem('bgg_layout') || 'large-grid';
    let userFavorites = []; // list of bggIds favorited by the current user
    let showOnlyFavorites = false; // whether to filter collection to only favorites
    let showLoginDropdown = true; // whether to show the user dropdown on login

    // New state for search, filter, and sort
    let searchTerm = '';
    let minPlayersFilter = null;
    let maxPlayersFilter = null;
    let maxPlaytimeFilter = null;
    let yearFilter = null;
    let sortOption = 'name_asc'; // Default sort
    let chatbotEnabled = true; // admin-configurable: show/hide chatbot

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
        'group-edit': getElement('group-edit-view'),
    };

    const navLinks = {
        login: getElement('nav-login'),
        collection: getElement('nav-collection'),
        shortlist: getElement('nav-shortlist'),
        events: getElement('nav-events'),
        admin: getElement('nav-admin'),
    };

    // New search, filter, and sort DOM elements
    const searchInput = getElement('search-input');
    const minPlayersFilterInput = getElement('min-players-filter');
    const maxPlayersFilterInput = getElement('max-players-filter');
    const maxPlaytimeFilterInput = getElement('max-playtime-filter');
    const yearFilterInput = getElement('year-filter');
    const sortBySelect = getElement('sort-by-select');
    const clearFiltersButton = getElement('clear-filters-button');

    // Additional commonly used DOM elements (ensure these are defined)
    const gameCollectionContainer = getElement('game-collection');
    const layoutSwitcher = getElement('layout-switcher');
    const userDisplay = getElement('user-display');
    const adminPanel = getElement('admin-panel');
    const wishlistFilterButton = getElement('wishlist-filter-button');
    const shortlistGamesContainer = getElement('shortlist-games');
    const groupEditView = getElement('group-edit-view');
    const groupEditName = getElement('group-edit-name');
    const groupEditCode = getElement('group-edit-code');
    const groupEditDesc = getElement('group-edit-desc');
    const groupEditMembers = getElement('group-edit-members');
    const groupEditAddInput = getElement('group-edit-add-username');
    const groupEditAddBtn = getElement('group-edit-add-btn');
    const groupEditSave = getElement('group-edit-save');
    const groupEditCancel = getElement('group-edit-cancel');
    const groupEditDelete = getElement('group-edit-delete');

    let editingGroupId = null;
    // Admin target user (when admin is setting password for another user)
    let adminTargetUser = null;

    // --- Firebase Refs ---
    const db = firebase.firestore();
    const functions = firebase.functions();
    // Callable Cloud Functions for password management
    const setPasswordFn = functions.httpsCallable('setPassword');
    const validatePasswordFn = functions.httpsCallable('validatePassword');
    
    // Global / top-level collections that remain unchanged
    const gamesCollectionRef = db.collection('games');
    const userWishlistsCollectionRef = db.collection('user_wishlists');
    const usersCollectionRef = db.collection('users');
    const summariesCollectionRef = db.collection('game_summaries');
    const configCollectionRef = db.collection('config');

    // Helper: ensure Translate/Generate buttons match the latest summaries state
    async function updateDescriptionButtons(bggId) {
        if (!bggId) return;
        const genBtn = document.getElementById('ai-summary-button');
        const translateBtn = document.getElementById('translate-desc-button');
        try {
            const snap = await summariesCollectionRef.doc(bggId).get();
            const data = snap.exists ? snap.data() : {};
            if (data && data.description_de && String(data.description_de).trim()) {
                if (genBtn) genBtn.classList.add('d-none');
                if (translateBtn) translateBtn.classList.add('d-none');
                return;
            }
            const lang = localStorage.getItem('bgg_lang') || 'de';
            if (data && data.description_de_auto && String(data.description_de_auto).trim()) {
                if (genBtn) genBtn.classList.add('d-none');
                if (translateBtn && lang === 'de') translateBtn.classList.remove('d-none');
                return;
            }
            if (data && data.description_en && String(data.description_en).trim()) {
                if (genBtn) genBtn.classList.remove('d-none');
                if (translateBtn && lang === 'de') translateBtn.classList.remove('d-none');
                return;
            }
            // fallback: show generator, hide translate
            if (genBtn) genBtn.classList.remove('d-none');
            if (translateBtn) translateBtn.classList.add('d-none');
        } catch (err) {
            console.warn('Could not update description buttons:', err);
        }
    }

    // Expose helper so other modules (e.g. chatbot) can trigger loading the Collection view
    try { window.loadCollection = fetchAndDisplayGames; } catch (e) { /* ignore in restricted environments */ }
    // Group-scoped refs: will be bound to the active group via setActiveGroup()
    let activeGroupId = localStorage.getItem('selected_group_id') || 'default';
    let groupDocRef = db.collection('groups').doc(activeGroupId);
    let shortlistCollectionRef = groupDocRef.collection('shortlist');
    let eventsCollectionRef = groupDocRef.collection('events');
    let pollsCollectionRef = groupDocRef.collection('polls');

    // --- Core Functions ---

    // Group modal UI elements (join-only flow)
    const groupJoinBtn = getElement('group-join-btn');
    const groupModalEl = getElement('group-modal');
    const groupJoinSubmit = getElement('group-join-submit');
    const groupJoinCodeInput = getElement('group-join-code');
    const groupModalStatus = getElement('group-modal-status');
    const groupModal = groupModalEl ? new bootstrap.Modal(groupModalEl) : null;
    const groupJoinList = getElement('group-join-list');
    const groupJoinSelectedInput = getElement('group-join-selected-id');

    if (groupJoinBtn) {
        groupJoinBtn.addEventListener('click', async () => {
            if (groupModalStatus) groupModalStatus.textContent = '';
            if (groupJoinCodeInput) groupJoinCodeInput.value = '';
            if (groupJoinList) {
                // populate user's groups if logged in
                if (groupModalStatus) groupModalStatus.textContent = '';
                if (groupJoinSelectedInput) groupJoinSelectedInput.value = '';
                await populateUserGroupSelect();
            }
            if (groupModal) groupModal.show();
        });
    }

    // Wire the active-group button to reflect modal state (pressed/active)
    (function wireActiveGroupButton() {
        const activeBtn = document.getElementById('active-group-display');
        const modalEl = document.getElementById('group-modal');
        if (!modalEl) return;

        // Update button state when modal shows
        modalEl.addEventListener('show.bs.modal', () => {
            if (activeBtn) {
                activeBtn.setAttribute('aria-pressed', 'true');
                activeBtn.classList.add('active');
            }
        });

        // Reset button state when modal hides
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (activeBtn) {
                activeBtn.setAttribute('aria-pressed', 'false');
                activeBtn.classList.remove('active');
            }
        });
    })();

    // Helper: return array of groups the current user belongs to: [{id,name},...]
    async function getUserGroups() {
        if (!currentUser) return [];
        try {
            // Note: querying a collectionGroup by documentId() requires a full document path
            // (e.g. 'groups/<groupId>/members/<memberId>'). Our member docs are keyed
            // by username (e.g. 'Emily') which is NOT a full path, and that causes
            // Firestore to throw an "odd number of segments" error. Only attempt the
            // fast collectionGroup query if `currentUser` already looks like a full
            // document path (contains a '/'). Otherwise skip to the fallback scan.
            if (currentUser && currentUser.includes('/')) {
                const q = db.collectionGroup('members').where(firebase.firestore.FieldPath.documentId(), '==', currentUser);
                const snap = await q.get();
                if (!snap.empty) {
                    const groupRefs = [];
                    const seen = new Set();
                    for (const mdoc of snap.docs) {
                        const membersColl = mdoc.ref.parent;
                        const groupRef = membersColl.parent;
                        if (groupRef && !seen.has(groupRef.path)) {
                            seen.add(groupRef.path);
                            groupRefs.push(groupRef);
                        }
                    }
                    const groupDocs = await Promise.all(groupRefs.map(r => r.get().catch(() => null)));
                    const options = [];
                    groupDocs.forEach(gdoc => {
                        if (!gdoc || !gdoc.exists) return;
                        const data = gdoc.data() || {};
                        options.push({ id: gdoc.id, name: data.name || gdoc.id });
                    });
                    options.sort((a, b) => a.name.localeCompare(b.name));
                    return options;
                }
            }
        } catch (err) {
            console.warn('collectionGroup approach failed in getUserGroups():', err);
        }

        // Fallback
        try {
            const groupsSnap = await db.collection('groups').get();
            if (groupsSnap.empty) return [];
            const options = [];
            await Promise.all(groupsSnap.docs.map(async (gdoc) => {
                try {
                    const memRef = db.collection('groups').doc(gdoc.id).collection('members').doc(currentUser);
                    const memSnap = await memRef.get();
                    if (memSnap.exists) {
                        const data = gdoc.data() || {};
                        options.push({ id: gdoc.id, name: data.name || gdoc.id });
                    }
                } catch (e) {}
            }));
            options.sort((a, b) => a.name.localeCompare(b.name));
            return options;
        } catch (err) {
            console.error('getUserGroups fallback error:', err);
            return [];
        }
    }

    // Populate the small dropdown inside the group-actions modal and return whether groups exist
    async function populateGaGroupSelect() {
        const sel = document.getElementById('ga-group-select');
        const changeBtn = document.getElementById('ga-change');
        const selectBtn = document.getElementById('ga-select');
        const area = document.getElementById('ga-select-area');
        if (!sel) return false;
        sel.innerHTML = '';
        const groups = await getUserGroups();
        if (!groups || groups.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = translations.no_groups_found || 'No groups found';
            sel.appendChild(opt);
            if (changeBtn) changeBtn.disabled = true;
            if (selectBtn) selectBtn.disabled = true;
            if (area) area.classList.add('d-none');
            return false;
        }
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            sel.appendChild(opt);
        });
        if (changeBtn) changeBtn.disabled = false;
        if (selectBtn) selectBtn.disabled = false;
        return true;
    }

    // When the actions modal shows, configure which controls to display
    (function wireGroupActionsModal() {
        const modalEl = document.getElementById('group-modal');
        if (!modalEl) return;
        modalEl.addEventListener('show.bs.modal', async () => {
            // Ensure active group name field is up-to-date
            updateActiveGroupDisplay();
            // Populate the full user group list so the modal shows available groups
            // and highlights the active group when the modal opens.
            try { await populateUserGroupSelect(); } catch (e) { console.warn('Could not populate group list on modal show', e); }

            const changeBtn = document.getElementById('ga-change');
            const selectBtn = document.getElementById('ga-select');
            const area = document.getElementById('ga-select-area');

            const groupsExist = await populateGaGroupSelect();

            // If user already signed into a non-default group, show Change, else show Select
            if (activeGroupId && activeGroupId !== 'default') {
                if (changeBtn) changeBtn.classList.remove('d-none');
                if (selectBtn) selectBtn.classList.add('d-none');
            } else {
                if (selectBtn) selectBtn.classList.remove('d-none');
                if (changeBtn) changeBtn.classList.add('d-none');
            }

            // Disable both if user has no groups
            if (!groupsExist) {
                if (changeBtn) changeBtn.disabled = true;
                if (selectBtn) selectBtn.disabled = true;
            }

            // Hide the selection area by default when modal opens
            if (area) area.classList.add('d-none');
        });

        // Toggle the small select area when clicking Change or Select
        const changeBtn = document.getElementById('ga-change');
        const selectBtn = document.getElementById('ga-select');
        const area = document.getElementById('ga-select-area');
        const gaApply = document.getElementById('ga-apply');

        if (changeBtn) changeBtn.addEventListener('click', async () => {
            // show the select area and populate immediately
            await populateGaGroupSelect();
            if (area) area.classList.remove('d-none');
            const sel = document.getElementById('ga-group-select');
            if (sel) {
                if (!sel.value) sel.selectedIndex = 0;
                try { sel.focus(); } catch (e) {}
            }
        });

        if (selectBtn) selectBtn.addEventListener('click', async () => {
            // show the select area and populate immediately
            await populateGaGroupSelect();
            if (area) area.classList.remove('d-none');
            const sel = document.getElementById('ga-group-select');
            if (sel) {
                if (!sel.value) sel.selectedIndex = 0;
                try { sel.focus(); } catch (e) {}
            }
        });

        if (gaApply) gaApply.addEventListener('click', async () => {
            const sel = document.getElementById('ga-group-select');
            if (!sel) return;
            const gid = sel.value || '';
            if (!gid) return;
            setActiveGroup(gid);
            // hide modals
            try { const m = bootstrap.Modal.getInstance(modalEl); if (m) m.hide(); } catch (e) {}
        });
    })();

    // Leave/signout are handled per-list-item now (icons on each row). Global 'ga-leave' handler intentionally removed.

    // Helper to generate a short random code
    const generateShortCode = (len = 6) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let s = '';
        for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    };



    if (groupJoinSubmit) {
        groupJoinSubmit.addEventListener('click', async () => {
            // First, if the user selected a group they belong to (from the button list), use that
            const selectedGroup = (groupJoinSelectedInput && groupJoinSelectedInput.value) ? groupJoinSelectedInput.value : '';
            if (selectedGroup) {
                setActiveGroup(selectedGroup);
                if (groupModal) groupModal.hide();
                return;
            }

            const code = (groupJoinCodeInput && groupJoinCodeInput.value || '').trim();
            if (!code) {
                if (groupModalStatus) groupModalStatus.textContent = translations.please_enter_group_code_or_select || 'Please enter a group code or select a group.';
                return;
            }

            try {
                const snap = await db.collection('groups').where('joinCode', '==', code).limit(1).get();
                let doc = null;
                if (!snap.empty) doc = snap.docs[0];
                else {
                    const direct = await db.collection('groups').doc(code).get();
                    if (direct.exists) doc = direct;
                }
                if (!doc) {
                    if (groupModalStatus) groupModalStatus.textContent = translations.group_not_found || 'Group not found.';
                    return;
                }

                setActiveGroup(doc.id);
                // Optionally add member record
                if (currentUser) {
                    try { await db.collection('groups').doc(doc.id).collection('members').doc(currentUser).set({ joinedAt: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) { /* ignore */ }
                }
                if (groupModal) groupModal.hide();
            } catch (err) {
                console.error('Group join error:', err);
                if (groupModalStatus) groupModalStatus.textContent = translations.could_not_join_group || 'Could not join group. See console.';
            }
        });
    }

    // --- Localization ---
    // Populate the join modal's group list with groups the current user belongs to
    async function populateUserGroupSelect() {
        // Prefer the new `#group-list` element if it exists, otherwise use `#group-join-list`
        const targetList = document.getElementById('group-list') || groupJoinList;
        if (!targetList) return;
        // Clear existing list
        targetList.innerHTML = '';

        // Clear the selected id
        if (groupJoinSelectedInput) groupJoinSelectedInput.value = '';

        if (!currentUser) {
            const item = document.createElement('div');
            item.className = 'list-group-item disabled';
            item.textContent = translations.sign_in_to_see_groups || 'Sign in to see your groups';
            targetList.appendChild(item);
            return;
        }

        let groups = [];
        try {
            // Try collectionGroup query first (fast)
            // When using FieldPath.documentId() against a collectionGroup the
            // provided value must be a full document path (e.g. 'groups/<gid>/members/<mid>').
            // Our member docs are keyed by username and won't be a full path, which
            // causes Firestore to throw. Only attempt the fast path when currentUser
            // appears to be a full path (contains a '/'). Otherwise skip to fallback.
            if (currentUser && currentUser.includes('/')) {
                const q = db.collectionGroup('members').where(firebase.firestore.FieldPath.documentId(), '==', currentUser);
                const snap = await q.get();
                if (!snap.empty) {
                    const groupRefs = [];
                    const seen = new Set();
                    for (const mdoc of snap.docs) {
                        const membersColl = mdoc.ref.parent;
                        const groupRef = membersColl.parent;
                        if (groupRef && !seen.has(groupRef.path)) {
                            seen.add(groupRef.path);
                            groupRefs.push(groupRef);
                        }
                    }
                    const groupDocs = await Promise.all(groupRefs.map(r => r.get().catch(() => null)));
                    groupDocs.forEach(gdoc => {
                        if (!gdoc || !gdoc.exists) return;
                        const data = gdoc.data() || {};
                        groups.push({ id: gdoc.id, name: data.name || gdoc.id });
                    });
                }
            }
        } catch (err) {
            console.warn('collectionGroup approach failed, falling back to scanning groups:', err);
        }

        if (groups.length === 0) {
            // Fallback: iterate top-level groups and check membership
            try {
                const groupsSnap = await db.collection('groups').get();
                if (!groupsSnap.empty) {
                    await Promise.all(groupsSnap.docs.map(async (gdoc) => {
                        try {
                            const memRef = db.collection('groups').doc(gdoc.id).collection('members').doc(currentUser);
                            const memSnap = await memRef.get();
                            if (memSnap.exists) {
                                const data = gdoc.data() || {};
                                groups.push({ id: gdoc.id, name: data.name || gdoc.id });
                            }
                        } catch (e) {
                            // ignore per-group errors
                        }
                    }));
                }
            } catch (err) {
                console.error('populateUserGroupSelect error (fallback):', err);
            }
        }

        if (!groups || groups.length === 0) {
            const noneItem = document.createElement('div');
            noneItem.className = 'list-group-item disabled';
            noneItem.textContent = translations.no_groups_found || 'No groups found';
            targetList.appendChild(noneItem);
            return;
        }

        groups.sort((a, b) => a.name.localeCompare(b.name));
        groups.forEach(g => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.dataset.groupId = g.id;

            const left = document.createElement('div');
            left.className = 'd-flex align-items-center gap-2 flex-grow-1';

            const title = document.createElement('div');
            title.className = 'group-name flex-grow-1';
            title.textContent = g.name || g.id;

            if (activeGroupId === g.id) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-primary ms-2';
                badge.textContent = translations.group_actions_active || 'Active';
                title.appendChild(badge);
                // visually mark the row as active so users can see the current group
                item.classList.add('active');
                if (groupJoinSelectedInput) groupJoinSelectedInput.value = g.id;
            }

            left.appendChild(title);

            const actions = document.createElement('div');
            actions.className = 'd-flex gap-2 align-items-center';

            // Only show the sign-out button on the currently active group row
            let signoutBtn = null;
            if (activeGroupId === g.id) {
                signoutBtn = document.createElement('button');
                signoutBtn.type = 'button';
                // add a specific class so we can style it differently when the row is active
                signoutBtn.className = 'btn btn-sm btn-outline-secondary group-signout-btn';
                signoutBtn.title = translations.group_actions_signout || 'Sign out';
                signoutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-right" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M6 3a1 1 0 0 0-1 1v3h1V4h7v8H6v-3H5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H6z"/><path fill-rule="evenodd" d="M11.146 8.354a.5.5 0 0 0 0-.708L9.793 6.293a.5.5 0 1 0-.707.707L9.793 8l-1.307 1.293a.5.5 0 0 0 .707.707l1.353-1.353z"/></svg>';

                signoutBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    // Clear active group (do not remove membership)
                    try { localStorage.removeItem('selected_group_id'); } catch (e) {}
                    setActiveGroup('default');
                    try { const m = bootstrap.Modal.getInstance(document.getElementById('group-modal')); if (m) m.hide(); } catch (e) {}
                });
            }

            const leaveBtn = document.createElement('button');
            leaveBtn.type = 'button';
            leaveBtn.className = 'btn btn-sm btn-outline-danger';
            leaveBtn.title = translations.group_actions_leave || 'Leave group';
            leaveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 5h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-7z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.11a1 1 0 0 1 .9-.6h2.98c.36 0 .69.21.86.54l.72 1.45H13.5a1 1 0 0 1 1 1z"/></svg>';

            leaveBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const confirmModalEl = document.getElementById('confirm-leave-modal');
                const confirmModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;

                // Hide the group modal so the confirm dialog appears on top
                try { const gm = bootstrap.Modal.getInstance(document.getElementById('group-modal')); if (gm) gm.hide(); } catch (e) {}

                if (!confirmModal) {
                    const confirmMsg = translations.group_actions_confirm_leave || 'Are you sure you want to leave this group?';
                    if (!confirm(confirmMsg)) {
                        // user cancelled browser confirm -> re-show group modal
                        try { if (groupModal) groupModal.show(); } catch (e) {}
                        return;
                    }
                    leaveGroupById(g.id);
                    return;
                }

                let leaveConfirmed = false;
                const confirmBtn = document.getElementById('confirm-leave-yes');
                if (confirmBtn) {
                    // replace to ensure we don't attach duplicate handlers
                    const newBtn = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
                    newBtn.addEventListener('click', async () => {
                        leaveConfirmed = true;
                        await leaveGroupById(g.id);
                        try { confirmModal.hide(); } catch (e) {}
                    });
                }

                // If the confirm modal is hidden without confirming (cancel), re-show the group modal
                if (confirmModalEl) {
                    const onHidden = () => {
                        if (!leaveConfirmed) {
                            try { if (groupModal) groupModal.show(); } catch (e) {}
                        }
                        confirmModalEl.removeEventListener('hidden.bs.modal', onHidden);
                    };
                    confirmModalEl.addEventListener('hidden.bs.modal', onHidden);
                }

                confirmModal.show();
            });

            // Append signout button only when it was created for the active group
            if (signoutBtn) actions.appendChild(signoutBtn);
            actions.appendChild(leaveBtn);

            item.appendChild(left);
            item.appendChild(actions);

            // clicking the row now activates the group immediately (single-click)
            item.addEventListener('click', async () => {
                try {
                    setActiveGroup(g.id);
                    // hide the modal if present
                    try { if (groupModal) groupModal.hide(); } catch (e) {}
                } catch (err) {
                    console.error('Error activating group on click:', err);
                }
            });

            targetList.appendChild(item);
        });
    }
    let translations = {};
    // Debounce utility for input handlers to reduce re-renders
    const debounce = (fn, ms = 250) => {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    };

    // Helper: determine whether any non-search collection filter is currently applied
    const isFilterApplied = () => {
        return (
            showOnlyFavorites ||
            minPlayersFilter !== null ||
            maxPlayersFilter !== null ||
            maxPlaytimeFilter !== null ||
            yearFilter !== null ||
            (sortOption && sortOption !== 'name_asc')
        );
    };

    // Update the visual active state of the filter toggle in the controls row
    const updateFilterToggleState = () => {
        try {
            if (!filterToggle) return;
            if (isFilterApplied()) {
                filterToggle.classList.add('active');
            } else {
                filterToggle.classList.remove('active');
            }
        } catch (e) {}
    };

    // Update the search toggle visual state when there is text in the search input
    const updateSearchToggleState = () => {
        try {
            if (!searchToggle) return;
            const hasText = (searchTerm && searchTerm.trim() !== '');
            if (hasText) {
                searchToggle.classList.add('has-text');
            } else {
                searchToggle.classList.remove('has-text');
            }
        } catch (e) {}
    };

    const updateWishlistButtonLabel = () => {
        if (!wishlistFilterButton) return;
        const baseLabel = translations.wishlist_filter_button || 'My Wishlist';
        const onLabel = translations.wishlist_filter_button_on || `${baseLabel} (on)`;
        wishlistFilterButton.textContent = showOnlyFavorites ? onLabel : baseLabel;
    };

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
        updateWishlistButtonLabel();
        updateActiveGroupDisplay();

        // Update collection count pill label
        const pillLabel = document.querySelector('#collection-count-pill .pill-label');
        if (pillLabel) {
            pillLabel.textContent = (translations && translations.collection_label_games) ? translations.collection_label_games : 'games';
        }

        // Update Event Buttons (Attend/Cancel)
        document.querySelectorAll('.attend-event-button').forEach(btn => {
            btn.textContent = translations.attend || 'Attend';
        });
        document.querySelectorAll('.cancel-attendance-button').forEach(btn => {
            btn.textContent = translations.cancel_attendance || 'Cancel Attendance';
        });
        document.querySelectorAll('.badge.bg-success').forEach(badge => {
            if (badge.textContent.includes('✓')) { // Simple check to target the attending badge
                badge.textContent = translations.attending_badge || 'Attending ✓';
            }
        });

        // Update Shortlist "Attend to vote" message
        // We look for the specific span with the text-muted class inside the shortlist container
        const shortlistContainer = document.getElementById('shortlist-games');
        if (shortlistContainer) {
            shortlistContainer.querySelectorAll('span.small.text-muted.fst-italic').forEach(span => {
                span.textContent = translations.attend_to_vote || 'Attend to vote';
            });
        }
        // Ensure filter and search toggles reflect active state after UI text updates
        try { updateFilterToggleState(); } catch (e) {}
        try { updateSearchToggleState(); } catch (e) {}
    }
    // --- End Localization ---

    function showView(viewName) {
        // Prevent non-admin users from viewing admin-only pages
        const adminOnlyViews = ['admin', 'group-edit'];
        if (adminOnlyViews.includes(viewName) && currentUser !== adminUser) {
            // If user is not admin, redirect to login and do not show the admin view
            console.warn(`Access denied to view '${viewName}' for user '${currentUser}'`);
            alert('Access denied. Admins only.');
            viewName = 'login';
        }

        Object.values(views).forEach(view => view && view.classList.add('d-none'));
        if (views[viewName]) {
            views[viewName].classList.remove('d-none');
        } else {
            console.warn(`View element not found for: ${viewName}`);
        }
        
        // Show collection controls only on collection view
        const controls = document.getElementById('collection-controls-fixed');
        if (viewName === 'collection') {
            document.body.classList.add('showing-collection');
            if (controls) controls.style.display = 'flex';
        } else {
            document.body.classList.remove('showing-collection');
            if (controls) controls.style.display = 'none';
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
            // Hide the top-nav login link while showing the login view to avoid a redundant link/button
            try {
                if (navLinks.login && navLinks.login.parentElement) navLinks.login.parentElement.classList.add('d-none');
            } catch (_) {}
        } else if (viewName === 'shortlist') {
            fetchAndDisplayShortlist();
            fetchNextGameNight();
        } else if (viewName === 'events') {
            fetchAndDisplayEvents();
            fetchAndDisplayPolls();
        } else if (viewName === 'collection') {
            loadUserWishlist().then(() => fetchAndDisplayGames());
            // After loading the collection, run a debug-pass to detect any elements
            // that overflow the viewport horizontally. This will add the
            // `.overflowing` class to problematic elements so they can be inspected
            // and gently clamped via CSS. We run it slightly delayed to allow
            // images to load and layout to settle.
            setTimeout(() => detectOverflowInCollection(), 220);
        } else if (viewName === 'admin') {
            // Only allow admin to load admin data
            if (currentUser === adminUser) fetchAndDisplayGroups();
        } else if (viewName === 'group-edit') {
            // group-edit is opened via showGroupEdit which handles loading; nothing to do here
        }

        // Ensure the top-nav Login link visibility is correct when switching views.
        // Hide the top-nav Login link when the app is showing the login view (to avoid a duplicate)
        // or when a user is already logged in. Otherwise show it so users can navigate to Login.
        try {
            if (navLinks.login && navLinks.login.parentElement) {
                if (viewName === 'login' || currentUser) {
                    navLinks.login.parentElement.classList.add('d-none');
                } else {
                    navLinks.login.parentElement.classList.remove('d-none');
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Scans the collection view for elements that extend beyond the viewport
    // and marks them with the `.overflowing` class. Also logs offenders to
    // the console for easier debugging. Called after the collection is rendered.
    function detectOverflowInCollection() {
        try {
            const container = document.getElementById('collection-view');
            if (!container) return;
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const offenders = [];
            // check only visible descendants
            const els = Array.from(container.querySelectorAll('*'));
            els.forEach(el => {
                // skip elements that are not displayed
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                const rect = el.getBoundingClientRect();
                if (rect.right > vw + 1 || rect.left < -1) {
                    el.classList.add('overflowing');
                    offenders.push({ tag: el.tagName, cls: el.className, rect });
                } else {
                    el.classList.remove('overflowing');
                }
            });
            if (offenders.length) {
                console.warn('Detected horizontal overflow in #collection-view. Offending elements:', offenders);
            } else {
                console.info('No horizontal overflow detected in #collection-view.');
            }
        } catch (err) {
            console.error('Error running detectOverflowInCollection:', err);
        }
    }

    // Header shrink behavior: reduce header height when scrolling down
    function updateHeaderShrink() {
        try {
            const header = document.querySelector('.site-header');
            const scrollContainer = document.getElementById('main-scroll-container');
            if (!header || !scrollContainer) return;
            
            // Use container scrollTop instead of window.scrollY
            if (scrollContainer.scrollTop > 50) {
                header.classList.add('shrunk');
            } else {
                header.classList.remove('shrunk');
            }
            // Update sizing immediately after class change
            updateHeaderSizing();
        } catch (err) {
            console.error('Error in updateHeaderShrink:', err);
        }
    }

    // Measure the header and set CSS variable
    function updateHeaderSizing() {
        try {
            const header = document.querySelector('.site-header');
            if (!header) return;
            
            const rect = header.getBoundingClientRect();
            const totalHeight = Math.ceil(rect.height);
            // Set CSS variable used by sticky controls
            document.documentElement.style.setProperty('--header-height', totalHeight + 'px');

            // As a fallback for browsers that don't handle CSS variable in `top` for sticky,
            // set the inline top on the controls element directly.
            const controls = document.getElementById('collection-controls-fixed');
            if (controls) {
                controls.style.top = totalHeight + 'px';
                controls.style.pointerEvents = 'auto';
            }
        } catch (err) {
            console.error('Error in updateHeaderSizing:', err);
        }
    }

    // Throttle scroll handler
    let _hsT = null;
    const scrollContainer = document.getElementById('main-scroll-container');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
            if (_hsT) return;
            _hsT = setTimeout(() => { updateHeaderShrink(); _hsT = null; }, 100);
        }, { passive: true });
    }

    // Initial setup
    window.addEventListener('load', () => { updateHeaderShrink(); updateHeaderSizing(); });
    window.addEventListener('resize', () => { updateHeaderShrink(); updateHeaderSizing(); });

    // Adjust bottom nav to avoid overlapping browser UI (Android quick-scroll arrow, etc.)
    function updateBottomNavOffset() {
        try {
            // Base offset in px (small gap)
            let offset = 8;

            // If VisualViewport is available, compute any extra inset caused by browser chrome
            if (window.visualViewport) {
                const vv = window.visualViewport;
                // Extra vertical space that is not part of the layout viewport
                const extra = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
                if (extra > 0) offset = Math.max(offset, Math.ceil(extra + 6));
            }

            // Small Android-specific nudge (helps with some Chrome/Samsung overlays)
            if (/Android/i.test(navigator.userAgent)) offset = Math.max(offset, 12);

            document.documentElement.style.setProperty('--app-bottom-offset', offset + 'px');
        } catch (err) {
            console.error('updateBottomNavOffset error', err);
        }
    }

    // Run at load and on viewport/resize changes
    window.addEventListener('load', updateBottomNavOffset);
    window.addEventListener('resize', updateBottomNavOffset);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updateBottomNavOffset);

    // Fetch next upcoming event and render a small calendar card
    async function fetchNextGameNight() {
        const container = document.getElementById('next-game-night-container');
        if (!container) return;
        container.innerHTML = '';

        try {
            const today = new Date();
            // Format YYYY-MM-DD for comparison with stored event.date strings
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;

            const snap = await eventsCollectionRef.where('date', '>=', todayStr).orderBy('date', 'asc').limit(1).get();
            if (snap.empty) {
                // No upcoming event; leave container empty
                return;
            }

            const doc = snap.docs[0];
            const ev = doc.data();
            const dateStr = ev.date; // expected 'YYYY-MM-DD'
            const dateObj = new Date(dateStr + 'T00:00:00');

            // Localized pieces
            const weekday = dateObj.toLocaleDateString(localStorage.getItem('bgg_lang') || 'de', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const month = dateObj.toLocaleDateString(localStorage.getItem('bgg_lang') || 'de', { month: 'short' }).toUpperCase();

            // Render clickable widget with event id so we can navigate to the Events view
            container.innerHTML = `
                <div class="next-game-night d-flex align-items-center" role="button" tabindex="0" data-event-id="${doc.id}">
                    <div class="next-game-calendar text-center">
                        <div class="ngn-weekday">${weekday}</div>
                        <div class="ngn-day">${dayNum}</div>
                        <div class="ngn-month">${month}</div>
                    </div>
                </div>
            `;

            // Attach click and keyboard handler to navigate to Events view and store selected id
            const widgetEl = container.querySelector('.next-game-night');
            if (widgetEl) {
                const eventId = widgetEl.dataset.eventId;
                const openEvent = () => {
                    try {
                        if (eventId) sessionStorage.setItem('selected_event_id', eventId);
                    } catch (_) {}
                    // navigate to events view
                    window.location.hash = 'events';
                };
                widgetEl.addEventListener('click', openEvent);
                widgetEl.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        openEvent();
                    }
                });
            }
        } catch (err) {
            console.error('Error fetching next game night:', err);
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
    const gameDetailsModal = new bootstrap.Modal(getElement('game-details-modal'));

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

    // verifyInitialActiveGroup logic moved to App Initialization block
    async function verifyInitialActiveGroup() {
        try {
            if (currentUser && activeGroupId && activeGroupId !== 'default') {
                const memRef = db.collection('groups').doc(activeGroupId).collection('members').doc(currentUser);
                const memSnap = await memRef.get();
                if (!memSnap.exists) {
                    try { localStorage.removeItem('selected_group_id'); } catch (_) {}
                    setActiveGroup('default');
                } else {
                        // If there's no logged-in user, do not restore a persisted
                        // active group — clear it and show the default placeholder.
                        if (!currentUser) {
                            try { localStorage.removeItem('selected_group_id'); } catch (_) {}
                            setActiveGroup('default');
                        } else {
                            setActiveGroup(activeGroupId);
                        }
                    }
            } else {
                setActiveGroup(activeGroupId);
            }
        } catch (e) {
            console.warn('Could not verify initial active group membership:', e);
            try { localStorage.removeItem('selected_group_id'); } catch (_) {}
            setActiveGroup('default');
        }
    }

    function updateUserNav() {
        const onLoginView = window.location.hash === '#login';
        if (currentUser) {
            // User is logged in: always show Collection nav
            if (navLinks.collection && navLinks.collection.parentElement) navLinks.collection.parentElement.classList.remove('d-none');

            // Only show shortlist/events/admin when a non-default active group is set
            const hasActiveGroup = activeGroupId && activeGroupId !== 'default';
            if (navLinks.shortlist && navLinks.shortlist.parentElement) {
                hasActiveGroup ? navLinks.shortlist.parentElement.classList.remove('d-none') : navLinks.shortlist.parentElement.classList.add('d-none');
            }
            if (navLinks.events && navLinks.events.parentElement) {
                hasActiveGroup ? navLinks.events.parentElement.classList.remove('d-none') : navLinks.events.parentElement.classList.add('d-none');
            }

            // Show admin nav to the designated admin regardless of group membership
            if (navLinks.admin) {
                if (currentUser === adminUser) {
                    if (navLinks.admin.parentElement) navLinks.admin.parentElement.classList.remove('d-none');
                    navLinks.admin.classList.remove('d-none');
                } else {
                    if (navLinks.admin.parentElement) navLinks.admin.parentElement.classList.add('d-none');
                    navLinks.admin.classList.add('d-none');
                }
            }

            // Hide login nav once logged in
            if (navLinks.login && navLinks.login.parentElement) navLinks.login.parentElement.classList.add('d-none');
        } else {
            // User is logged out: hide app nav options except the Login nav
            if (navLinks.collection && navLinks.collection.parentElement) navLinks.collection.parentElement.classList.add('d-none');
            if (navLinks.shortlist && navLinks.shortlist.parentElement) navLinks.shortlist.parentElement.classList.add('d-none');
            if (navLinks.events && navLinks.events.parentElement) navLinks.events.parentElement.classList.add('d-none');
            if (navLinks.admin && navLinks.admin.parentElement) navLinks.admin.parentElement.classList.add('d-none');
            if (navLinks.login && navLinks.login.parentElement) navLinks.login.parentElement.classList.toggle('d-none', onLoginView);
        }
    }

    function updateUserDisplay() {
        if (currentUser) {
            // Compact user display: username only, reveal logout and set-password on click
            userDisplay.innerHTML = `
                <div class="d-flex align-items-center">
                    <button id="user-toggle" class="btn btn-sm btn-link p-0"><strong>${currentUser}</strong></button>
                    <div id="user-menu" class="d-none ms-2">
                        <button class="btn btn-sm btn-outline-primary me-1" id="set-password-button" title="Set Password">🔐</button>
                        <button class="btn btn-sm btn-outline-secondary" id="logout-button">${translations.logout_button || 'Logout'}</button>
                    </div>
                </div>
            `;
            // Attach keyboard handler to toggle (created as part of innerHTML)
            const userToggle = document.getElementById('user-toggle');
            const userMenu = document.getElementById('user-menu');
            if (userToggle) {
                // Open user options modal on click (instead of simple dropdown)
                userToggle.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const modalEl = document.getElementById('user-options-modal');
                    if (modalEl) {
                        // update title to current user
                        document.getElementById('user-options-modal-label').textContent = `Options for ${currentUser}`;
                        const modal = new bootstrap.Modal(modalEl);
                        modal.show();
                    }
                });
                userToggle.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); userToggle.click(); } });
            }
            // Attach set password button handler
            const setPasswordButton = document.getElementById('set-password-button');
            if (setPasswordButton) {
                setPasswordButton.addEventListener('click', () => {
                    const modal = new bootstrap.Modal(document.getElementById('set-password-modal'));
                    document.getElementById('set-password-input').value = '';
                    document.getElementById('set-password-confirm').value = '';
                    document.getElementById('set-password-status').textContent = '';
                    modal.show();
                });
            }

            // Wire user options modal buttons
            const userOptSetPassword = document.getElementById('user-opt-set-password');
            const userOptLogout = document.getElementById('user-opt-logout');
            const userOptChangeUsername = document.getElementById('user-opt-change-username');
            if (userOptSetPassword) {
                userOptSetPassword.addEventListener('click', () => {
                    // Open set-password modal for current user
                    adminTargetUser = null;
                    document.getElementById('set-password-modal-label').textContent = `Set Password for ${currentUser}`;
                    document.getElementById('set-password-input').value = '';
                    document.getElementById('set-password-confirm').value = '';
                    document.getElementById('set-password-status').textContent = '';
                    try { const mi = bootstrap.Modal.getInstance(document.getElementById('user-options-modal')); if (mi) mi.hide(); } catch (e) {}
                    new bootstrap.Modal(document.getElementById('set-password-modal')).show();
                });
            }
            if (userOptLogout) {
                userOptLogout.addEventListener('click', () => {
                    localStorage.removeItem('bgg_username');
                    currentUser = null;
                    updateUserDisplay();
                    fetchUsernames();
                    try { const mi = bootstrap.Modal.getInstance(document.getElementById('user-options-modal')); if (mi) mi.hide(); } catch (e) {}
                    showView('login');
                });
            }
            if (userOptChangeUsername) {
                userOptChangeUsername.addEventListener('click', () => {
                    try { const mi = bootstrap.Modal.getInstance(document.getElementById('user-options-modal')); if (mi) mi.hide(); } catch (e) {}
                    document.getElementById('change-username-input').value = '';
                    document.getElementById('change-username-status').textContent = '';
                    new bootstrap.Modal(document.getElementById('change-username-modal')).show();
                });
            }
            // Show admin panel if the current user is the admin
            if (adminPanel) {
                if (currentUser === adminUser) {
                    adminPanel.classList.remove('d-none');
                            // Wire wishlist visibility toggle and group select
                            try {
                                const toggle = document.getElementById('wishlist-visible-toggle');
                                const groupSel = document.getElementById('wishlist-group-select');
                                const summaryEl = document.getElementById('wishlist-summary');
                                if (toggle && summaryEl) {
                                    // initialize unchecked (hidden)
                                    toggle.checked = false;
                                    toggle.addEventListener('change', async () => {
                                        if (toggle.checked) {
                                            summaryEl.classList.remove('d-none');
                                            await loadWishlistSummary();
                                        } else {
                                            summaryEl.classList.add('d-none');
                                        }
                                    });
                                }
                                if (groupSel) {
                                    groupSel.addEventListener('change', async () => {
                                        // If summary visible, reload with new filter
                                        if (document.getElementById('wishlist-summary') && !document.getElementById('wishlist-summary').classList.contains('d-none')) {
                                            await loadWishlistSummary();
                                        }
                                    });
                                }
                            } catch (e) {}
                    // Load users for admin to manage
                    fetchAndDisplayUsers();
                    fetchAndDisplayGroups();
                } else {
                    adminPanel.classList.add('d-none');
                }
            }
            // Show wishlist filter to logged-in users
            if (wishlistFilterButton) {
                wishlistFilterButton.classList.remove('d-none');
                wishlistFilterButton.classList.toggle('active', showOnlyFavorites);
                updateWishlistButtonLabel();
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
        updateActiveGroupDisplay();
        updateActiveGroupVisibility();
        updateJoinButtonVisibility();
    }

    // Use the main group modal instance
    const groupModalInstance = groupModal; // created earlier from #group-modal

    // Click outside to close user menu (single listener)
    document.addEventListener('click', (ev) => {
        const userMenu = document.getElementById('user-menu');
        const userToggle = document.getElementById('user-toggle');
        if (userMenu && !userMenu.classList.contains('d-none')) {
            if (ev.target !== userToggle && !userMenu.contains(ev.target)) {
                userMenu.classList.add('d-none');
            }
        }
    });
    const activeGroupDisplay = document.getElementById('active-group-display');
    const gaChangeBtn = document.getElementById('ga-change');

    if (activeGroupDisplay) {
        activeGroupDisplay.addEventListener('click', () => {
            const gaCurrent = document.getElementById('ga-current-id');
            if (gaCurrent) gaCurrent.textContent = '';
            // Ensure active group display is up-to-date and show the modal
            updateActiveGroupDisplay();
            if (groupModalInstance) groupModalInstance.show();
        });
        activeGroupDisplay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activeGroupDisplay.click();
            }
        });
    }

    if (gaChangeBtn) {
        gaChangeBtn.addEventListener('click', () => {
            if (groupModal) groupModal.show();
        });
    }

    // Per-item sign-out is handled on each row; global sign-out button removed.

    // --- Admin: Group Management ---
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function formatTimestamp(ts) {
        if (!ts) return '';
        try {
            if (ts.toDate) return ts.toDate().toLocaleString();
            return new Date(ts).toLocaleString();
        } catch (e) {
            return String(ts);
        }
    }

    async function fetchAndDisplayGroups() {
        if (currentUser !== adminUser) {
            console.warn('fetchAndDisplayGroups called by non-admin user; aborting.');
            return;
        }
        const list = document.getElementById('admin-groups-list');
        if (!list) return;
        list.innerHTML = `<div class="small text-muted">${translations.group_loading_groups || 'Loading groups...'}</div>`;
        try {
            const snap = await db.collection('groups').orderBy('createdAt', 'desc').get();
            if (snap.empty) { list.innerHTML = `<div class="small text-muted">${translations.no_groups_found || 'No groups found'}</div>`; return; }
            let html = '';
            snap.forEach(doc => {
                const g = doc.data() || {};
                const name = escapeHtml(g.name || '');
                const code = escapeHtml(g.joinCode || '');
                html += `<div class="list-group-item d-flex justify-content-between align-items-center" data-id="${doc.id}">
                    <div>
                        <div class="fw-bold group-name">${name}</div>
                        <div class="small text-muted">Code: <span class="group-code">${code}</span></div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-secondary me-2 edit-group-btn" data-id="${doc.id}">Edit</button>
                        <button class="btn btn-sm btn-danger delete-group-btn" data-id="${doc.id}">Delete</button>
                    </div>
                </div>`;
            });
            list.innerHTML = html;

            // Also populate wishlist group select (used by Admin wishlist summary filter)
            try {
                const sel = document.getElementById('wishlist-group-select');
                if (sel) {
                    // Preserve current selection if possible
                    const current = sel.value || 'all';
                    sel.innerHTML = '<option value="all">Show all</option>';
                    snap.forEach(doc => {
                        const g = doc.data() || {};
                        const name = escapeHtml(g.name || doc.id);
                        const opt = document.createElement('option');
                        opt.value = doc.id;
                        opt.textContent = name;
                        sel.appendChild(opt);
                    });
                    // restore selection if still present
                    try { sel.value = current; } catch (_) {}
                }
            } catch (e) {}

            // Attach event handlers
            list.querySelectorAll('.delete-group-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.dataset.id;
                    if (!confirm('Delete this group? This will remove the group document.')) return;
                    try { await db.collection('groups').doc(id).delete(); fetchAndDisplayGroups(); } catch (err) { alert('Could not delete group. See console.'); console.error(err); }
                });
            });

            // Open the Group Edit view when Edit is clicked
            list.querySelectorAll('.edit-group-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    showGroupEdit(id);
                });
            });
        } catch (err) {
            console.error('Error loading groups:', err);
            list.innerHTML = `<div class="text-danger small">${translations.group_load_groups_error || 'Could not load groups.'}</div>`;
        }
    }

    // Show the Group Edit view and populate fields for the given group id
    // Load and render members list for a group
    async function loadGroupMembers(groupId) {
        if (!groupId || !groupEditMembers) return;
        groupEditMembers.innerHTML = `<div class="small text-muted">${translations.group_loading_members || 'Loading members...'}</div>`;
        try {
            const membersSnap = await db.collection('groups').doc(groupId).collection('members').orderBy('joinedAt','asc').get();
            if (membersSnap.empty) {
                groupEditMembers.innerHTML = `<div class="small text-muted">${translations.group_no_members || 'No members.'}</div>`;
                return;
            }
            let membersHtml = '';
            membersSnap.forEach(mdoc => {
                const mdata = mdoc.data() || {};
                const username = escapeHtml(mdoc.id);
                const joined = formatTimestamp(mdata.joinedAt);
                membersHtml += `<div class="list-group-item d-flex justify-content-between align-items-center"><div>${username}</div><div class="d-flex align-items-center"><div class="small text-muted me-2">${joined}</div><button class="btn btn-sm btn-outline-danger remove-member-btn" data-username="${username}">Remove</button></div></div>`;
            });
            groupEditMembers.innerHTML = membersHtml;

            // Attach delete handlers
            groupEditMembers.querySelectorAll('.remove-member-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const username = btn.dataset.username;
                    if (!username) return;
                    if (currentUser !== adminUser) { alert('Admins only'); return; }
                    if (!confirm(`Remove member '${username}' from this group?`)) return;
                    try {
                        await db.collection('groups').doc(groupId).collection('members').doc(username).delete();
                        await loadGroupMembers(groupId);
                    } catch (err) {
                        console.error('Could not remove member:', err);
                        alert('Could not remove member. See console.');
                    }
                });
            });
        } catch (err) {
            console.error('Could not load group members:', err);
            groupEditMembers.innerHTML = `<div class="text-danger small">${translations.group_load_members_error || 'Could not load members.'}</div>`;
        }
    }

    async function showGroupEdit(groupId) {
        if (currentUser !== adminUser) {
            alert('Access denied. Admins only.');
            return;
        }
        if (!groupId) return;
        try {
            const doc = await db.collection('groups').doc(groupId).get();
            if (!doc.exists) {
                alert('Group not found');
                return;
            }
            const data = doc.data() || {};
            editingGroupId = groupId;
            if (groupEditName) groupEditName.value = data.name || '';
            if (groupEditCode) groupEditCode.value = data.joinCode || '';
            if (groupEditDesc) groupEditDesc.value = data.description || '';
            // Load members for display
            await loadGroupMembers(groupId);
            showView('group-edit');
        } catch (err) {
            console.error('Could not open group edit view:', err);
            alert('Could not open group editor. See console.');
        }
    }

    // Save handler
    if (groupEditSave) {
        groupEditSave.addEventListener('click', async () => {
            if (!editingGroupId) return alert('No group selected');
            const name = groupEditName ? groupEditName.value.trim() : '';
            const code = groupEditCode ? groupEditCode.value.trim() : '';
            const desc = groupEditDesc ? groupEditDesc.value.trim() : '';
            if (!name) return alert('Please enter a group name.');
            try {
                await db.collection('groups').doc(editingGroupId).update({ name, joinCode: code || null, description: desc || null });
                editingGroupId = null;
                fetchAndDisplayGroups();
                showView('admin');
            } catch (err) {
                console.error('Could not save group:', err);
                alert('Could not save changes. See console.');
            }
        });
    }

    // Cancel/back handler
    if (groupEditCancel) {
        groupEditCancel.addEventListener('click', () => {
            editingGroupId = null;
            showView('admin');
        });
    }

    // Delete handler on the edit page
    if (groupEditDelete) {
        groupEditDelete.addEventListener('click', async () => {
            if (!editingGroupId) return;
            if (!confirm('Delete this group? This will remove the group document.')) return;
            try {
                await db.collection('groups').doc(editingGroupId).delete();
                editingGroupId = null;
                fetchAndDisplayGroups();
                showView('admin');
            } catch (err) {
                console.error('Could not delete group:', err);
                alert('Could not delete group. See console.');
            }
        });
    }

    // Add-member handler
    if (groupEditAddBtn) {
        groupEditAddBtn.addEventListener('click', async () => {
            if (currentUser !== adminUser) { alert('Admins only'); return; }
            if (!editingGroupId) return alert('No group selected');
            const username = (groupEditAddInput && groupEditAddInput.value || '').trim();
            if (!username) return alert('Please enter a username.');
            try {
                await db.collection('groups').doc(editingGroupId).collection('members').doc(username).set({ joinedAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (groupEditAddInput) groupEditAddInput.value = '';
                await loadGroupMembers(editingGroupId);
            } catch (err) {
                console.error('Could not add member:', err);
                alert('Could not add member. See console.');
            }
        });
    }

    if (groupEditAddInput) {
        groupEditAddInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (groupEditAddBtn) groupEditAddBtn.click();
            }
        });
    }

    // Create group from admin UI
    const adminCreateBtn = getElement('admin-create-group');
    if (adminCreateBtn) {
        adminCreateBtn.addEventListener('click', async () => {
            const nameEl = getElement('admin-group-name');
            const codeEl = getElement('admin-group-code');
            const name = nameEl ? nameEl.value.trim() : '';
            const code = codeEl ? codeEl.value.trim() : '';
            if (!name) { alert('Please enter a group name.'); return; }
            try {
                const docRef = await db.collection('groups').add({ name, joinCode: code || null, createdBy: currentUser || null, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                if (nameEl) nameEl.value = '';
                if (codeEl) codeEl.value = '';
                fetchAndDisplayGroups();
            } catch (err) { console.error('Could not create group:', err); alert('Could not create group. See console.'); }
        });
    }

    // Update header with active group info
    async function updateActiveGroupDisplay() {
        const el = document.getElementById('active-group-display');
        if (!el) return;
        // If nobody is logged in, never show an active group in the header.
        if (!currentUser) {
            el.classList.add('d-none');
            const gaIdEl = document.getElementById('ga-current-id');
            if (gaIdEl) gaIdEl.textContent = '';
            return;
        }
        // Keep the status hidden when the active group is the default placeholder or not set.
        if (!activeGroupId || activeGroupId === 'default') {
            el.classList.add('d-none');
            const gaIdEl = document.getElementById('ga-current-id');
            if (gaIdEl) gaIdEl.textContent = '';
            return;
        }

        try {
            const doc = await groupDocRef.get();
            if (doc.exists) {
                const data = doc.data();
                const groupName = data && data.name ? data.name : activeGroupId;
                el.classList.remove('d-none');
                // Display only the group name (no 'Group:' label).
                el.innerHTML = `<strong>${escapeHtml(groupName)}</strong>`;
                const gaIdEl = document.getElementById('ga-current-id');
                if (gaIdEl) gaIdEl.textContent = groupName;
            } else {
                el.classList.remove('d-none');
                el.innerHTML = `<strong>${escapeHtml(activeGroupId)}</strong>`;
                const gaIdEl = document.getElementById('ga-current-id');
                if (gaIdEl) gaIdEl.textContent = activeGroupId;
            }
        } catch (err) {
            console.warn('Could not read group info:', err);
            el.classList.remove('d-none');
            el.innerHTML = `<strong>${escapeHtml(activeGroupId)}</strong>`;
            const gaIdEl = document.getElementById('ga-current-id');
            if (gaIdEl) gaIdEl.textContent = activeGroupId;
        }
    }

    // Show/hide the Join Group button depending on whether an active group is set
    function updateJoinButtonVisibility() {
        if (!groupJoinBtn) return;
        // Only show Join button when a user is logged in and the active group is not set (or is default)
        const shouldShow = currentUser && (!activeGroupId || activeGroupId === 'default');
        groupJoinBtn.classList.toggle('d-none', !shouldShow);
    }

    // Ensure active group display is hidden when the active group is the default placeholder
    function updateActiveGroupVisibility() {
        const el = document.getElementById('active-group-display');
        if (!el) return;
        // Hide when not logged in or when activeGroup is default
        if (!currentUser || !activeGroupId || activeGroupId === 'default') {
            el.classList.add('d-none');
        } else {
            el.classList.remove('d-none');
        }
    }

    // Responsive helper: force a compact nav class when the viewport is narrow.
    // This complements CSS media queries and helps when styles are cached or
    // when the UA scales the viewport. Threshold mirrors CSS breakpoint.
    function applyNavCompactClass() {
        try {
            const threshold = 520; // px, matches CSS breakpoint
            const w = window.innerWidth || document.documentElement.clientWidth;
            const isCompact = w <= threshold;

            // Detect wrapping of the nav tabs as an additional fallback.
            const nav = document.querySelector('.nav.nav-tabs');
            let wrapped = false;
            if (nav) {
                const items = nav.querySelectorAll('.nav-item');
                if (items && items.length > 1) {
                    const firstTop = items[0].offsetTop;
                    for (let i = 1; i < items.length; i++) {
                        if (items[i].offsetTop !== firstTop) { wrapped = true; break; }
                    }
                }
            }

            const shouldCompact = isCompact || wrapped;
            if (shouldCompact) {
                document.documentElement.classList.add('nav-compact');
            } else {
                document.documentElement.classList.remove('nav-compact');
            }

            // Debugging logs visible in DevTools console when needed
            if (window.location.search.indexOf('navdebug') !== -1) {
                console.info('applyNavCompactClass:', { w, threshold, isCompact, wrapped, shouldCompact });
            }
        } catch (e) {
            console.warn('applyNavCompactClass error', e);
        }
    }
    // Apply immediately and on resize/orientation change
    try { applyNavCompactClass(); window.addEventListener('resize', applyNavCompactClass); window.addEventListener('orientationchange', applyNavCompactClass); } catch (e) {}

    // Change active group and rebind collection refs. Call this when user joins/switches groups.
    function setActiveGroup(groupId) {
        if (!groupId) return;
        activeGroupId = groupId;
        localStorage.setItem('selected_group_id', groupId);
        groupDocRef = db.collection('groups').doc(groupId);
        shortlistCollectionRef = groupDocRef.collection('shortlist');
        eventsCollectionRef = groupDocRef.collection('events');
        pollsCollectionRef = groupDocRef.collection('polls');
        // Re-fetch views that depend on these refs
        if (views.shortlist && !views.shortlist.classList.contains('d-none')) fetchAndDisplayShortlist();
        if (views.events && !views.events.classList.contains('d-none')) fetchAndDisplayEvents();
        updateActiveGroupDisplay();
        updateActiveGroupVisibility();
        updateJoinButtonVisibility();
        updateUserNav();
    }

    // Remove membership for a given group id (safe to call from UI handlers)
    async function leaveGroupById(targetGroupId) {
        const gid = targetGroupId || activeGroupId;
        try {
            if (!currentUser) {
                alert(translations.not_logged_in || 'Not logged in');
                return;
            }
            await db.collection('groups').doc(gid).collection('members').doc(currentUser).delete();
        } catch (err) {
            console.warn('Error removing membership document:', err);
        }

        try {
            if (activeGroupId && activeGroupId === gid) setActiveGroup('default');
        } catch (e) {}

        // Hide the group modal if open
        try {
            const modalEl = document.getElementById('group-modal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
        } catch (e) {}

        try {
            alert(translations.group_actions_left || 'You have left the group.');
        } catch (e) {}
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
                // Update all matching favorite buttons on the page (main list and modal)
                const favButtons = document.querySelectorAll(`.favorite-toggle[data-bgg-id="${bggId}"]`);
                favButtons.forEach(favButton => {
                    favButton.classList.toggle('active', userFavorites.includes(bggId));
                    favButton.textContent = userFavorites.includes(bggId) ? '★' : '☆';
                });
            }
        } catch (err) {
            console.error('Error toggling favorite:', err);
            alert('Could not update your wishlist.');
        }
    }

    // Admin: load wishlist summary (counts per game with user details and game cards)
    async function loadWishlistSummary() {
        const summaryDiv = document.getElementById('wishlist-summary-modal-body') || document.getElementById('wishlist-summary');
        const isModal = summaryDiv && summaryDiv.id === 'wishlist-summary-modal-body';
        summaryDiv.innerHTML = '<p class="text-muted">Loading wishlist summary...</p>';
        try {
            const snap = await userWishlistsCollectionRef.get();
            const counts = {}; // { bggId: count }
            const usersByGame = {}; // { bggId: [username1, username2, ...] }

            // Determine if we should limit counts to a specific group's members.
            const wishlistGroupSelect = document.getElementById('wishlist-group-select');
            const selectedGroupForFilter = wishlistGroupSelect ? wishlistGroupSelect.value : 'all';
            let memberSet = null; // Set of usernames to include (null => include all)
            if (selectedGroupForFilter && selectedGroupForFilter !== 'all') {
                try {
                    memberSet = new Set();
                    const membersSnap = await db.collection('groups').doc(selectedGroupForFilter).collection('members').get();
                    membersSnap.forEach(md => memberSet.add(md.id));
                } catch (e) {
                    console.warn('Could not load members for wishlist-group-select filter:', e);
                    memberSet = null; // fallback to including all if members can't be loaded
                }
            }

            snap.forEach(doc => {
                const username = doc.id;
                // If a memberSet exists, only include wishlists from those usernames
                if (memberSet && !memberSet.has(username)) return;
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
            
            // Show a header only when rendering inline; modal already has a title.
            let html = '';
            if (!isModal) html += '<h5>Wishlist Summary</h5>';

            // Determine which group should be used for shortlist actions.
            // The admin `#wishlist-group-select` controls this. If it's set to "all",
            // we fall back to the current `activeGroupId`. If that fallback is missing,
            // no shortlist buttons will be shown (per request).
            const selectedGroup = selectedGroupForFilter;
            let targetGroupId = null;
            if (selectedGroup === 'all') {
                targetGroupId = (activeGroupId && activeGroupId !== 'default') ? activeGroupId : null;
            } else {
                targetGroupId = selectedGroup;
            }

            // If a concrete target group exists, show its name so the admin knows
            // which group's shortlist is being referenced. Otherwise remain silent
            // (no active-group warning or 'Choose Group' buttons).
            let currentGroupName = null;
            if (targetGroupId) {
                try {
                    const gdoc = await db.collection('groups').doc(targetGroupId).get();
                    if (gdoc.exists) currentGroupName = (gdoc.data() && gdoc.data().name) ? gdoc.data().name : targetGroupId;
                } catch (e) { /* ignore */ }
            }
            if (currentGroupName) {
                html += `<div class="mb-2"><strong>Target group:</strong> ${escapeHtml(currentGroupName)}</div>`;
            }

            html += '<div class="row" id="wishlist-summary-games">';
            for (const [bggId, count] of entries) {
                const gdoc = await gamesCollectionRef.doc(bggId).get();
                if (!gdoc.exists) continue;

                const game = gdoc.data();
                const users = usersByGame[bggId] ? usersByGame[bggId].join(', ') : '';

                // If we have a target group, check if this game is already shortlisted there.
                let isShortlisted = false;
                if (targetGroupId) {
                    try {
                        const targetShortlistRef = db.collection('groups').doc(targetGroupId).collection('shortlist');
                        const shortlistDoc = await targetShortlistRef.doc(bggId).get();
                        isShortlisted = shortlistDoc ? shortlistDoc.exists : false;
                    } catch (e) {
                        console.warn('Could not check shortlist for target group:', e);
                    }
                }

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
                                    ${targetGroupId ? `<button class="btn btn-sm btn-vote wishlist-shortlist-btn ${isShortlisted ? 'voted' : ''} add-to-shortlist-button" data-bgg-id="${game.bggId}" aria-pressed="${isShortlisted}">${isShortlisted ? 'Shortlisted ✓' : 'Shortlist'}</button>` : ''}
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
        shortlistCollectionRef.onSnapshot(async snapshot => {
            shortlistGamesContainer.innerHTML = ''; // Clear old list
            if (snapshot.empty) {
                shortlistGamesContainer.innerHTML = '<p>No games on the shortlist yet.</p>';
                return;
            }

            // Check attendance for next event
            let canVote = false;
            try {
                const today = new Date().toISOString().split('T')[0];
                const eventSnap = await eventsCollectionRef
                    .where('date', '>=', today)
                    .orderBy('date', 'asc')
                    .limit(1)
                    .get();
                
                if (!eventSnap.empty) {
                    const nextEvent = eventSnap.docs[0].data();
                    if (currentUser && nextEvent.attendees && nextEvent.attendees.includes(currentUser)) {
                        canVote = true;
                    }
                }
            } catch (err) {
                console.error("Error checking next event:", err);
            }

            const games = snapshot.docs.map(doc => doc.data());
            games.sort((a, b) => (b.voters?.length || 0) - (a.voters?.length || 0));
            
            const maxVotes = games.length > 0 ? (games[0].voters?.length || 0) : 0;

            games.forEach(game => {
                const voters = game.voters || [];
                const voteCount = voters.length;
                const isTopVoted = maxVotes > 0 && voteCount === maxVotes;
                const badgeClass = isTopVoted ? 'top-voted' : '';
                const userHasVoted = currentUser && voters.includes(currentUser);
                
                // Determine what to show for the vote control
                let voteControlHTML = '';
                const btnText = userHasVoted ? 'Voted ✓' : 'Vote';
                let btnTitle = userHasVoted ? 'You have voted — click to remove your vote' : 'Click to vote for this game';

                if (userHasVoted) {
                    // User has voted: show active button (always allowed to remove vote)
                    const btnClass = `btn btn-sm btn-vote shortlist-toggle-button voted`;
                    voteControlHTML = `<button class="${btnClass}" data-bgg-id="${game.bggId}" title="${btnTitle}" aria-label="${btnTitle}" aria-pressed="true">${btnText}</button>`;
                } else if (canVote) {
                    // User can vote: show inactive button
                    const btnClass = `btn btn-sm btn-vote shortlist-toggle-button`;
                    voteControlHTML = `<button class="${btnClass}" data-bgg-id="${game.bggId}" title="${btnTitle}" aria-label="${btnTitle}" aria-pressed="false">${btnText}</button>`;
                } else {
                    // User cannot vote and hasn't voted: show text
                    const msg = translations.attend_to_vote || 'Attend to vote';
                    voteControlHTML = `<span class="small text-muted fst-italic me-2">${msg}</span>`;
                }

                const removeBtn = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-danger ms-2 remove-shortlist-button" data-bgg-id="${game.bggId}">Remove</button>` : '';

                const gameCard = `
                    <div class="col-12 mb-4">
                        <div class="card game-card list-layout" data-bgg-id="${game.bggId}">
                            <div class="vote-count-badge ${badgeClass}">${voters.length}</div>
                            <img src="${game.image}" class="card-img-top" alt="${game.name}">
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <p class="card-text">${game.year || ''}</p>
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="d-flex align-items-center">
                                        ${voteControlHTML}
                                        ${removeBtn}
                                    </div>
                                    <span class="voter-names" title="${voters.join(', ')}">
                                        ${voters.length} vote${voters.length !== 1 ? 's' : ''}
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

            const toNumber = (val) => {
                const n = parseInt(val, 10);
                return Number.isFinite(n) ? n : null;
            };

            // Build array for filtering/sorting
            let games = snapshot.docs.map(doc => doc.data());

            // Expose the unfiltered complete games list to other modules (chatbot may want full catalog)
            try { window.allGamesUnfiltered = snapshot.docs.map(doc => doc.data()); } catch (e) { /* ignore */ }

            // Apply filters
            games = games.filter(game => {
                // Wishlist filter
                if (showOnlyFavorites && currentUser && !userFavorites.includes(game.bggId)) return false;

                // Search by name
                if (searchTerm && !game.name.toLowerCase().includes(searchTerm)) return false;

                const minP = toNumber(game.minPlayers);
                const maxP = toNumber(game.maxPlayers);
                const playTime = toNumber(game.playingTime);
                const year = toNumber(game.year);

                if (minPlayersFilter !== null && (minP === null || minP < minPlayersFilter)) return false;
                if (maxPlayersFilter !== null && (maxP === null || maxP > maxPlayersFilter)) return false;
                if (maxPlaytimeFilter !== null && (playTime === null || playTime > maxPlaytimeFilter)) return false;
                if (yearFilter !== null && (year === null || year !== yearFilter)) return false;

                return true;
            });

            // Apply sorting
            games.sort((a, b) => {
                const aName = a.name || '';
                const bName = b.name || '';
                const aMin = toNumber(a.minPlayers) ?? Number.MAX_SAFE_INTEGER;
                const bMin = toNumber(b.minPlayers) ?? Number.MAX_SAFE_INTEGER;
                const aMax = toNumber(a.maxPlayers) ?? Number.MAX_SAFE_INTEGER;
                const bMax = toNumber(b.maxPlayers) ?? Number.MAX_SAFE_INTEGER;
                const aYear = toNumber(a.year) ?? 0;
                const bYear = toNumber(b.year) ?? 0;

                switch (sortOption) {
                    case 'year_asc':
                        return aYear - bYear || aName.localeCompare(bName);
                    case 'year_desc':
                        return bYear - aYear || aName.localeCompare(bName);
                    case 'min_players_asc':
                        return aMin - bMin || aName.localeCompare(bName);
                    case 'max_players_asc':
                        return aMax - bMax || aName.localeCompare(bName);
                    case 'name_asc':
                    default:
                        return aName.localeCompare(bName);
                }
            });

            // Expose the filtered & sorted games to other modules (chatbot)
            try { window.allGames = games; } catch (e) { /* ignore */ }

            // Layout classes
            let colClass = 'col-xl-2 col-lg-3 col-md-4 col-6'; // Default to large-grid (same as old small-grid)
            if (currentLayout === 'small-grid') colClass = 'col-xl-1 col-lg-2 col-md-3 col-4';
            if (currentLayout === 'list') colClass = 'col-12';

            games.forEach(game => {
                const cardLayoutClass = currentLayout === 'list' ? 'list-layout' : '';
                const isFav = currentUser && userFavorites.includes(game.bggId);
                const favBtnClass = isFav ? 'active' : '';
                const favAria = `Toggle favorite for ${game.name}`;
                const favButton = `<button class="btn btn-sm favorite-toggle ${favBtnClass}" data-bgg-id="${game.bggId}" aria-label="${favAria}" title="${favAria}">${isFav ? '★' : '☆'}</button>`;
                // Show Shortlist button on collection page only to admin. If the game is already shortlisted, mark as voted/highlighted.
                let voteButtonHTML = '';
                if (currentUser === adminUser) {
                    const shortlistDoc = shortlistedMap[game.bggId];
                    const isShortlisted = Boolean(shortlistDoc);
                    const voters = shortlistDoc ? (shortlistDoc.voters || []) : [];
                    const isVotedByAdmin = voters.includes(currentUser);
                    const btnText = isShortlisted ? 'Shortlisted ✓' : 'Shortlist';
                    const btnClass = isVotedByAdmin ? 'voted' : (isShortlisted ? 'shortlisted' : '');
                    voteButtonHTML = `<button class="btn btn-sm btn-vote add-to-shortlist-button ${btnClass}" data-bgg-id="${game.bggId}" aria-pressed="${isVotedByAdmin}" aria-label="${btnText} \u2014 ${game.name}">${btnText}</button>`;
                }
                
                let gameCard = '';
                if (currentLayout === 'small-grid') {
                    gameCard = `
                    <div class="${colClass} mb-4">
                        <div class="card game-card ${cardLayoutClass}" data-bgg-id="${game.bggId}">
                            <div class="game-card-image-container">
                                <img src="${game.image}" loading="lazy" class="card-img-top" alt="${game.name}">
                                ${favButton}
                            </div>
                            <div class="card-body">
                                <h5 class="card-title">${game.name}</h5>
                                <div class="d-flex gap-2">
                                    ${voteButtonHTML}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                } else if (currentLayout === 'list') {
                    gameCard = `
                    <div class="${colClass} mb-4">
                        <div class="card game-card ${cardLayoutClass}" data-bgg-id="${game.bggId}">
                            <div class="game-card-image-container">
                                <img src="${game.image}" loading="lazy" class="card-img-top" alt="${game.name}">
                            </div>
                            <div class="card-body">
                                <h5 class="card-title"><span class="game-title-text">${game.name}</span></h5>
                                <div class="d-flex gap-2 card-actions-row align-items-center">
                                    ${favButton}
                                    ${voteButtonHTML}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                } else {
                    // large-grid (default) - keep favorite inline to the right of the title
                    gameCard = `
                    <div class="${colClass} mb-4">
                        <div class="card game-card ${cardLayoutClass}" data-bgg-id="${game.bggId}">
                            <div class="game-card-image-container">
                                <img src="${game.image}" loading="lazy" class="card-img-top" alt="${game.name}">
                            </div>
                            <div class="card-body">
                                <h5 class="card-title d-flex align-items-center justify-content-between"><span class="game-title-text">${game.name}</span>${favButton}</h5>
                                <div class="d-flex gap-2">
                                    ${voteButtonHTML}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                }
                gameCollectionContainer.insertAdjacentHTML('beforeend', gameCard);
            });
            // Update collection count pill (number of games currently listed)
            try {
                const pill = document.getElementById('collection-count-pill');
                if (pill) {
                    const count = games.length;
                    const label = (translations && translations.collection_label_games) ? translations.collection_label_games : 'games';
                    // Two-line content: number on first line, localized label on second line
                    pill.innerHTML = `<span class="pill-number">${count}</span><span class="pill-label">${label}</span>`;
                    pill.classList.toggle('d-none', count === 0);
                    // Use contextual color: secondary when not filtered, primary when filters/search applied
                    const hasFilter = showOnlyFavorites || Boolean(searchTerm) || minPlayersFilter !== null || maxPlayersFilter !== null || maxPlaytimeFilter !== null || yearFilter !== null;
                    pill.classList.remove('bg-secondary','bg-primary');
                    pill.classList.add(hasFilter ? 'bg-primary' : 'bg-secondary');
                }
            } catch (e) { /* non-fatal */ }
        } catch (error) {
            console.error("Error fetching games from Firebase:", error);
            gameCollectionContainer.innerHTML = '<p class="text-danger">Could not fetch game collection from Firebase.</p>';
        }
    }

    // --- Event Listeners ---

    // Helper function to check if user has password and show/hide password field
    async function checkUserPasswordStatus(username) {
        const passwordField = getElement('password-field');
        if (!passwordField) return;
        
        if (!username) {
            passwordField.classList.add('d-none');
            return;
        }

        try {
            const userDoc = await usersCollectionRef.doc(username).get();
            if (userDoc.exists && userDoc.data().hasPassword === true) {
                passwordField.classList.remove('d-none');
            } else {
                passwordField.classList.add('d-none');
            }
        } catch (err) {
            console.error('Error checking user password status:', err);
            passwordField.classList.add('d-none');
        }
    }

    // Debounce for username input to avoid too many Firestore reads
    let usernameCheckTimeout = null;

    // Show password field if user has password set
    usernameInput.addEventListener('input', (e) => {
        // Reset dropdown if user starts typing a new name
        if (existingUsersDropdown) {
            existingUsersDropdown.value = '';
        }
        
        // Debounce the password check
        clearTimeout(usernameCheckTimeout);
        usernameCheckTimeout = setTimeout(() => {
            checkUserPasswordStatus(e.target.value.trim());
        }, 300);
    });

    // Handle dropdown selection
    if (existingUsersDropdown) {
        existingUsersDropdown.addEventListener('change', (e) => {
            if (e.target.value) {
                usernameInput.value = e.target.value; // Populate text input with selected name
                checkUserPasswordStatus(e.target.value);
            } else {
                usernameInput.value = ''; // Clear text input if 'Select existing user' is chosen
                getElement('password-field')?.classList.add('d-none');
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

        const password = getElement('password-input').value;
        const passwordField = getElement('password-field');

        // Check if user exists and has a password set
        try {
            const userDoc = await usersCollectionRef.doc(username).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            const hasPassword = userData && userData.hasPassword === true;

            // If user has a password, validate it via Cloud Function
            if (hasPassword) {
                if (!password) {
                    // Show password field if not visible and prompt
                    if (passwordField) passwordField.classList.remove('d-none');
                    alert("This user has a password set. Please enter your password.");
                    return;
                }
                
                try {
                    const result = await validatePasswordFn({ username, password });
                    if (!result.data.valid) {
                        alert('Incorrect password.');
                        return;
                    }
                } catch (err) {
                    console.error('Error validating password:', err);
                    alert('Could not validate password. Please try again.');
                    return;
                }
            }

            // Login successful
            currentUser = username;
            localStorage.setItem('bgg_username', username);
            // Ensure the currently selected active group (from localStorage) is one
            // the user actually belongs to. New users or users who aren't members
            // should not see an active group selected.
            try {
                if (activeGroupId && activeGroupId !== 'default') {
                    const memRef = db.collection('groups').doc(activeGroupId).collection('members').doc(username);
                    const memSnap = await memRef.get();
                    if (!memSnap.exists) {
                        try { localStorage.removeItem('selected_group_id'); } catch (_) {}
                        setActiveGroup('default');
                    } else {
                        // Re-apply the active group bindings in case they were stale
                        setActiveGroup(activeGroupId);
                    }
                }
            } catch (e) {
                console.warn('Could not verify active group membership on login:', e);
                setActiveGroup('default');
            }
            updateUserDisplay();
            showView('collection');
            await loadUserWishlist();
            fetchAndDisplayGames();

            // Save new user to Firebase if they don't already exist
            if (!userDoc.exists) {
                await usersCollectionRef.doc(username).set({ 
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    hasPassword: false
                });
                fetchUsernames(); // Refresh dropdown with new user
            }
        } catch (err) {
            console.error('Error during login:', err);
            alert('Login failed. Please try again.');
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
            // Reset active group to default to avoid showing groups the logged-out user may not belong to
            try { localStorage.removeItem('selected_group_id'); } catch (_) {}
            try { sessionStorage.removeItem('selected_event_id'); } catch (_) {}
            setActiveGroup('default');
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

    // Compact control toggles for collection view with mutually exclusive panels
    const searchToggle = document.getElementById('search-toggle');
    const sortToggle = document.getElementById('sort-toggle');
    const filterToggle = document.getElementById('filter-toggle');
    const searchCollapseEl = document.getElementById('search-collapse');
    const sortCollapseEl = document.getElementById('sort-collapse');
    const filterCollapseEl = document.getElementById('filter-collapse');
    const searchInputEl = document.getElementById('search-input');

    // Helper to close all panels and remove active state
    const closeAllPanels = () => {
        [searchCollapseEl, sortCollapseEl, filterCollapseEl].forEach(el => {
            if (el) {
                const bs = bootstrap.Collapse.getInstance(el);
                if (bs) bs.hide();
            }
        });
        [searchToggle, sortToggle, filterToggle].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
    };

    // Helper to open a specific panel and close others
    const openPanel = (toggleBtn, collapseEl) => {
        closeAllPanels();
        if (toggleBtn && collapseEl) {
            const bs = bootstrap.Collapse.getOrCreateInstance(collapseEl);
            bs.show();
            // Only mark the toggle active when filters are actually applied
            // (opening the panel alone should not imply an active filter)
            updateFilterToggleState();
        }
    };

    // Ensure the filter toggle button reflects the collapse state visually
    if (filterCollapseEl && filterToggle) {
        // When the collapse opens, add an 'open' class so CSS can style it
        filterCollapseEl.addEventListener('show.bs.collapse', () => {
            try { filterToggle.classList.add('open'); } catch (e) {}
            // when the filter panel opens, ensure active state reflects any active filters
            try { updateFilterToggleState(); } catch (e) {}
        });
        // Remove the 'open' class when it hides and re-evaluate filter active state
        filterCollapseEl.addEventListener('hidden.bs.collapse', () => {
            try { filterToggle.classList.remove('open'); } catch (e) {}
            try { updateFilterToggleState(); } catch (e) {}
        });
    }
    // Mirror the same open-state behaviour for search and sort toggles
    if (searchCollapseEl && searchToggle) {
        searchCollapseEl.addEventListener('show.bs.collapse', () => {
            try { searchToggle.classList.add('open'); } catch (e) {}
            // when search opens, ensure filter toggle remains correct
            try { updateFilterToggleState(); } catch (e) {}
        });
        searchCollapseEl.addEventListener('hidden.bs.collapse', () => {
            try { searchToggle.classList.remove('open'); } catch (e) {}
            // when search collapses, re-evaluate filter active state (so filter remains highlighted if active)
            try { updateFilterToggleState(); } catch (e) {}
        });
    }
    if (sortCollapseEl && sortToggle) {
        sortCollapseEl.addEventListener('show.bs.collapse', () => {
            try { sortToggle.classList.add('open'); } catch (e) {}
            try { updateFilterToggleState(); } catch (e) {}
        });
        sortCollapseEl.addEventListener('hidden.bs.collapse', () => {
            try { sortToggle.classList.remove('open'); } catch (e) {}
            try { updateFilterToggleState(); } catch (e) {}
        });
    }

    if (searchToggle && searchCollapseEl) {
        searchToggle.addEventListener('click', (ev) => {
            ev.preventDefault();
            const bs = bootstrap.Collapse.getInstance(searchCollapseEl);
            const isOpen = bs && searchCollapseEl.classList.contains('show');
            if (isOpen) {
                closeAllPanels();
            } else {
                openPanel(searchToggle, searchCollapseEl);
                // focus when opening
                setTimeout(() => { if (searchInputEl) searchInputEl.focus(); }, 200);
            }
        });
    }

    if (sortToggle && sortCollapseEl) {
        sortToggle.addEventListener('click', (ev) => {
            ev.preventDefault();
            const bs = bootstrap.Collapse.getInstance(sortCollapseEl);
            const isOpen = bs && sortCollapseEl.classList.contains('show');
            if (isOpen) {
                closeAllPanels();
            } else {
                openPanel(sortToggle, sortCollapseEl);
            }
        });
    }

    // Fallback for touch devices: some browsers/webviews drop click events
    // when elements sit inside transformed/scrolling containers. To improve
    // responsiveness, synthesize a click on pointerdown for touch input so
    // the existing click handlers run immediately.
    (function attachTouchFallback() {
        const controlsRoot = document.getElementById('collection-controls-fixed');
        if (!controlsRoot) return;

        controlsRoot.addEventListener('pointerdown', (ev) => {
            try {
                // Only synthesize for touch input to avoid duplicating mouse clicks
                if (ev.pointerType && ev.pointerType !== 'touch') return;

                const btn = ev.target.closest('button, .btn');
                if (!btn) return;

                // Synthesize click immediately to ensure handlers run on touch devices
                const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                btn.dispatchEvent(clickEvent);

                // Prevent default to avoid potential duplicate native click in some contexts
                ev.preventDefault();
            } catch (err) {
                // silent
            }
        }, { passive: false });
    })();

    if (filterToggle && filterCollapseEl) {
        filterToggle.addEventListener('click', (ev) => {
            ev.preventDefault();
            const bs = bootstrap.Collapse.getInstance(filterCollapseEl);
            const isOpen = bs && filterCollapseEl.classList.contains('show');
            if (isOpen) {
                closeAllPanels();
            } else {
                openPanel(filterToggle, filterCollapseEl);
            }
        });
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Layout Switcher
    layoutSwitcher.addEventListener('click', (e) => {
        // Support clicks on child SVG/path elements by finding the nearest button ancestor
        const btn = e.target.closest('button');
        if (btn && layoutSwitcher.contains(btn)) {
            const layout = btn.dataset.layout;
            if (layout) {
                applyLayout(layout);
                fetchAndDisplayGames(); // Re-render the collection with the new layout classes
            }
        }
    });

    // Wishlist filter toggle (debounced to avoid duplicate activations on touch)
    if (wishlistFilterButton) {
        let _lastWishlistToggleAt = 0;
        const WISHLIST_TOGGLE_MIN_DELTA = 350; // ms

        const doWishlistToggle = (ev) => {
            const now = Date.now();
            if (now - _lastWishlistToggleAt < WISHLIST_TOGGLE_MIN_DELTA) {
                ev && ev.preventDefault();
                return;
            }
            _lastWishlistToggleAt = now;
            showOnlyFavorites = !showOnlyFavorites;
            wishlistFilterButton.classList.toggle('active', showOnlyFavorites);
            updateWishlistButtonLabel();
            updateFilterToggleState();
            fetchAndDisplayGames();
        };

        wishlistFilterButton.addEventListener('click', (e) => doWishlistToggle(e));

        // For touch devices, pointer events can be more reliable — also guarded
        wishlistFilterButton.addEventListener('pointerup', (e) => {
            if (e.pointerType && e.pointerType !== 'touch') return;
            doWishlistToggle(e);
        });
    }

    // Search input
    if (searchInput) {
        const doSearch = debounce(() => {
            searchTerm = searchInput.value.trim().toLowerCase();
            updateSearchToggleState();
            fetchAndDisplayGames();
        }, 300);
        searchInput.addEventListener('input', doSearch);
        // Clear button for search input
        const clearSearchButton = getElement('clear-search-button');
        const updateClearButtonVisibility = () => {
            try {
                if (!clearSearchButton) return;
                const hasText = searchInput.value && searchInput.value.trim() !== '';
                clearSearchButton.classList.toggle('d-none', !hasText);
                // also toggle a class on the input-group so both input and button can be highlighted
                const ig = searchInput.closest('.input-group');
                if (ig) ig.classList.toggle('search-has-text', !!hasText);
            } catch (e) {}
        };

        // initialize visibility
        updateClearButtonVisibility();

        // keep visibility in sync on input
        searchInput.addEventListener('input', updateClearButtonVisibility);

        if (clearSearchButton) {
            clearSearchButton.addEventListener('click', (e) => {
                e.preventDefault();
                try { searchInput.value = ''; } catch (er) {}
                searchTerm = '';
                updateSearchToggleState();
                updateClearButtonVisibility();
                fetchAndDisplayGames();
                try { searchInput.focus(); } catch (er) {}
            });
        }
    }

    const parseFilterNumber = (inputEl) => {
        if (!inputEl) return null;
        const val = inputEl.value.trim();
        if (val === '') return null;
        const n = parseInt(val, 10);
        return Number.isFinite(n) ? n : null;
    };

    const attachNumberFilter = (inputEl, setter) => {
        if (!inputEl) return;
        const doFilter = debounce(() => {
            setter(parseFilterNumber(inputEl));
            updateFilterToggleState();
            fetchAndDisplayGames();
        }, 300);
        inputEl.addEventListener('input', doFilter);
    };

    attachNumberFilter(minPlayersFilterInput, (val) => { minPlayersFilter = val; });
    attachNumberFilter(maxPlayersFilterInput, (val) => { maxPlayersFilter = val; });
    attachNumberFilter(maxPlaytimeFilterInput, (val) => { maxPlaytimeFilter = val; });
    attachNumberFilter(yearFilterInput, (val) => { yearFilter = val; });

    if (sortBySelect) {
        sortBySelect.addEventListener('change', () => {
            sortOption = sortBySelect.value;
                    updateFilterToggleState();
            fetchAndDisplayGames();
        });
    }

            if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
            searchTerm = '';
            minPlayersFilter = null;
            maxPlayersFilter = null;
            maxPlaytimeFilter = null;
            yearFilter = null;
            sortOption = 'name_asc';
            showOnlyFavorites = false;

            if (searchInput) searchInput.value = '';
            if (minPlayersFilterInput) minPlayersFilterInput.value = '';
            if (maxPlayersFilterInput) maxPlayersFilterInput.value = '';
            if (maxPlaytimeFilterInput) maxPlaytimeFilterInput.value = '';
            if (yearFilterInput) yearFilterInput.value = '';
            if (sortBySelect) sortBySelect.value = 'name_asc';
            if (wishlistFilterButton) {
                wishlistFilterButton.classList.remove('active');
                updateWishlistButtonLabel();
            }
            updateFilterToggleState();
            // clear search text state as well
            searchTerm = '';
            updateSearchToggleState();
            fetchAndDisplayGames();
        });
    }

    // Reusable function to show the game details modal
    async function showGameDetailsModal(bggId) {
        currentlySelectedBggId = bggId; // Store the ID
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
                detailsHtml += `<p><strong>${translations.modal_players_label || 'Players'}:</strong> ${game.minPlayers} - ${game.maxPlayers}</p>`;
            }
            if (game.playingTime && game.playingTime !== 'N/A') {
                detailsHtml += `<p><strong>${translations.modal_play_time_label || 'Play Time'}:</strong> ${game.playingTime} min</p>`;
            }
            if (game.rating && game.rating !== 'N/A') {
                detailsHtml += `<p><strong>${translations.modal_rating_label || 'Rating'}:</strong> ${game.rating} / 10</p>`;
            }
            if (game.year) {
                detailsHtml += `<p><strong>${translations.modal_year_published_label || 'Year Published'}:</strong> ${game.year}</p>`;
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

            // --- Add favorite button to modal footer ---
            const favContainer = document.getElementById('modal-favorite-container');
            if (favContainer) {
                const isFav = currentUser && userFavorites.includes(bggId);
                const favBtnClass = isFav ? 'active' : '';
                const favButtonHTML = `<button class="btn btn-outline-warning favorite-toggle ${favBtnClass}" data-bgg-id="${bggId}" title="Toggle favorite">${isFav ? '★' : '☆'}</button>`;
                favContainer.innerHTML = favButtonHTML;
                favContainer.querySelector('.favorite-toggle').addEventListener('click', (e) => {
                    toggleFavorite(e.target.dataset.bggId);
                });
            }

            // --- Check for and display existing description/summary in game_summaries ---
            const lang = localStorage.getItem('bgg_lang') || 'de';
            const summaryField = `summary_${lang}`;
            const summarySnap = await summariesCollectionRef.doc(currentlySelectedBggId).get();
            const summaryData = summarySnap.exists ? summarySnap.data() : {};
            // Ensure the AI summary container exists in the modal body (modal body was overwritten earlier)
            let summaryContainer = document.getElementById('ai-summary-container');
            const modalBody = document.getElementById('game-modal-body');
            if (!summaryContainer && modalBody) {
                summaryContainer = document.createElement('div');
                summaryContainer.id = 'ai-summary-container';
                modalBody.appendChild(summaryContainer);
            }

            // Helper to show/hide the generate and translate buttons
            const genBtnEl = document.getElementById('ai-summary-button');
            const translateBtnEl = document.getElementById('translate-desc-button');

            if (summaryContainer) {
                // Display priority:
                // 1) description_de (admin final)
                // 2) description_de_auto (auto translation)
                // 3) description_en (imported English) — show Translate button
                // 4) fallback to AI summary in summaries collection
                // Show German descriptions only when UI language is German; otherwise prefer English
                if (lang === 'de' && summaryData && summaryData.description_de && String(summaryData.description_de).trim()) {
                    summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${summaryData.description_de}</p>`;
                    if (genBtnEl) genBtnEl.classList.add('d-none');
                    if (translateBtnEl) translateBtnEl.classList.add('d-none');
                } else if (lang === 'de' && summaryData && summaryData.description_de_auto && String(summaryData.description_de_auto).trim()) {
                    summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${summaryData.description_de_auto} <span class="badge bg-secondary ms-2">${translations.auto_translated_badge || 'Auto-translated'}</span></p>`;
                    if (genBtnEl) genBtnEl.classList.add('d-none');
                    if (translateBtnEl) translateBtnEl.classList.remove('d-none');
                } else if (summaryData && summaryData.description_en && String(summaryData.description_en).trim()) {
                    // Show English source and allow translation when appropriate
                    summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description (EN):'}</strong> ${summaryData.description_en}</p>`;
                    if (genBtnEl) genBtnEl.classList.remove('d-none');
                    if (translateBtnEl && lang === 'de') translateBtnEl.classList.remove('d-none');
                } else {
                    // No imported description; fall back to AI summaries
                    if (summarySnap.exists && summaryData[summaryField]) {
                        summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${summaryData[summaryField]}</p>`;
                    } else {
                        summaryContainer.innerHTML = `<p class="text-muted">${translations.ai_summary_missing || 'No summary available.'}</p>`;
                    }
                    if (genBtnEl) genBtnEl.classList.remove('d-none');
                    if (translateBtnEl) translateBtnEl.classList.add('d-none');
                }
            }

            // Admin inline editor controls
            try {
                // Ensure editor elements exist (some flows overwrite modal markup)
                let editBtn = document.getElementById('edit-summary-button');
                let saveBtn = document.getElementById('save-summary-button');
                let deleteBtn = document.getElementById('delete-summary-button');
                let aiEditor = document.getElementById('ai-summary-editor');
                let aiText = document.getElementById('ai-summary-text');

                const modalFooter = document.querySelector('#game-details-modal .modal-footer');
                // If footer exists but buttons are missing, create them and insert before the generate button
                if (modalFooter && !(editBtn && saveBtn && deleteBtn)) {
                    console.debug('Admin buttons missing — creating dynamically');
                    // Find generate button to place our buttons before it
                    const genBtn = modalFooter.querySelector('#ai-summary-button');
                    const container = document.createElement('div');
                    container.className = 'd-flex gap-2 align-items-center';

                    editBtn = editBtn || document.createElement('button');
                    editBtn.id = 'edit-summary-button';
                    editBtn.className = 'btn btn-outline-secondary d-none';
                    editBtn.textContent = translations.edit_summary_button || 'Edit Summary';

                    saveBtn = saveBtn || document.createElement('button');
                    saveBtn.id = 'save-summary-button';
                    saveBtn.className = 'btn btn-primary d-none';
                    saveBtn.textContent = translations.save_summary_button || 'Save Summary';

                    deleteBtn = deleteBtn || document.createElement('button');
                    deleteBtn.id = 'delete-summary-button';
                    deleteBtn.className = 'btn btn-danger d-none';
                    deleteBtn.textContent = translations.delete_summary_button || 'Delete Summary';

                    container.appendChild(editBtn);
                    container.appendChild(saveBtn);
                    container.appendChild(deleteBtn);
                    // Insert container before generate button if present, else append to footer
                    if (genBtn && genBtn.parentNode) {
                        genBtn.parentNode.insertBefore(container, genBtn);
                    } else {
                        modalFooter.insertBefore(container, modalFooter.firstChild);
                    }
                }

                // Ensure editor exists in modal body
                const modalBody = document.getElementById('game-modal-body') || document.querySelector('#game-details-modal .modal-body');
                if (modalBody && !aiEditor) {
                    console.debug('AI editor missing — creating dynamically');
                    aiEditor = document.createElement('div');
                    aiEditor.id = 'ai-summary-editor';
                    aiEditor.className = 'mt-3 d-none';
                    aiText = document.createElement('textarea');
                    aiText.id = 'ai-summary-text';
                    aiText.className = 'form-control';
                    aiText.rows = 3;
                    aiText.placeholder = 'Enter custom summary...';
                    const label = document.createElement('label');
                    label.setAttribute('for', 'ai-summary-text');
                    label.className = 'form-label';
                    label.textContent = (translations.edit_summary_button || 'Edit Summary') + ' (admin)';
                    aiEditor.appendChild(label);
                    aiEditor.appendChild(aiText);
                    modalBody.appendChild(aiEditor);
                }

                // Helper to show/hide admin controls depending on user
                if (editBtn && saveBtn && deleteBtn && aiEditor && aiText) {
                    // Determine admin status: prefer Firestore flag, fallback to configured adminUser (case-insensitive)
                    let isAdmin = false;
                    try {
                        if (currentUser) {
                            const udoc = await usersCollectionRef.doc(currentUser).get();
                            if (udoc.exists && udoc.data() && udoc.data().isAdmin === true) {
                                isAdmin = true;
                            }
                        }
                    } catch (err) {
                        console.warn('Could not read user document to determine admin status:', err);
                    }
                    if (!isAdmin && currentUser && adminUser && (String(currentUser).toLowerCase() === String(adminUser).toLowerCase())) {
                        isAdmin = true;
                    }

                    if (isAdmin) {
                        editBtn.classList.remove('d-none');
                        deleteBtn.classList.remove('d-none');
                        // ensure editor and save are hidden initially
                        aiEditor.classList.add('d-none');
                        saveBtn.classList.add('d-none');
                    } else {
                        editBtn.classList.add('d-none');
                        saveBtn.classList.add('d-none');
                        deleteBtn.classList.add('d-none');
                        aiEditor.classList.add('d-none');
                    }

                    // wire handlers (use onclick to avoid duplicate listeners)
                    editBtn.onclick = () => {
                        // toggle editor visibility and populate with current summary/description if present
                        const hasSummary = summaryDoc.exists && summaryDoc.data()[summaryField];
                        const hasDescription = game && game.description && String(game.description).trim();
                        if (hasDescription) {
                            aiText.value = game.description || '';
                        } else if (hasSummary) {
                            aiText.value = summaryDoc.data()[summaryField] || '';
                        } else {
                            aiText.value = '';
                        }
                        aiEditor.classList.toggle('d-none');
                        // show save when editor visible
                        saveBtn.classList.toggle('d-none', aiEditor.classList.contains('d-none'));
                    };

                    saveBtn.onclick = async () => {
                        const newText = (aiText.value || '').trim();
                        try {
                            const hasDescription = game && game.description && String(game.description).trim();
                            if (hasDescription) {
                                                    await gamesCollectionRef.doc(currentlySelectedBggId).set({ description: newText }, { merge: true });
                                                    summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${newText}</p>`;
                                                    try { await updateDescriptionButtons(currentlySelectedBggId); } catch(_){}
                            } else {
                                // Save into the summaries collection as before
                                const data = {};
                                data[summaryField] = newText;
                                await summariesCollectionRef.doc(currentlySelectedBggId).set(data, { merge: true });
                                summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${newText}</p>`;
                                try { await updateDescriptionButtons(currentlySelectedBggId); } catch(_){}
                            }
                            // hide editor and save
                            aiEditor.classList.add('d-none');
                            saveBtn.classList.add('d-none');
                        } catch (err) {
                            console.error('Error saving summary/description:', err);
                            alert('Could not save summary/description. See console for details.');
                        }
                    };

                    deleteBtn.onclick = async () => {
                        const confirmText = translations.confirm_delete_description || translations.confirm_delete_ai_summary || 'Delete description/summary?';
                        if (!confirm(confirmText)) return;
                        try {
                            // Remove only the final German description field (preserve English/source fields)
                            const deletePayload = { description_de: firebase.firestore.FieldValue.delete() };

                            // Apply to summaries collection only; preserve description_en
                            const summariesRef = summariesCollectionRef.doc(currentlySelectedBggId);
                            try {
                                await summariesRef.update(deletePayload);
                            } catch (updateErr) {
                                console.debug('Update failed when deleting german summary fields, falling back to set with merge:', updateErr);
                                await summariesRef.set(deletePayload, { merge: true });
                            }

                            summaryContainer.innerHTML = `<p class="text-muted">${translations.ai_summary_missing || 'No summary available.'}</p>`;
                            try { await updateDescriptionButtons(currentlySelectedBggId); } catch(_){ }

                            aiEditor.classList.add('d-none');
                            saveBtn.classList.add('d-none');
                        } catch (err) {
                            console.error('Error deleting summary/description:', err);
                            alert(translations.delete_summary_failed || 'Could not delete summary/description. See console for details.');
                        }
                    };
                }
            } catch (err) {
                console.warn('AI summary admin controls not available:', err);
            }
            // --- End summary check ---
            // Ensure buttons reflect latest state
            try { await updateDescriptionButtons(currentlySelectedBggId); } catch(_){}

            gameDetailsModal.show();
        }
    }

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
            showGameDetailsModal(card.dataset.bggId);
        }
    });

    // Show Game Details Modal for Shortlist
    shortlistGamesContainer.addEventListener('click', async (e) => {
        const card = e.target.closest('.game-card');
        // Ignore clicks on the vote button for opening details
        if (card && !e.target.classList.contains('shortlist-toggle-button') && !e.target.classList.contains('remove-shortlist-button')) {
            showGameDetailsModal(card.dataset.bggId);
        }
    });

    // --- API and AI Functions ---

    // Translate Description → DE (reuse generateAiSummary cloud function)
    document.getElementById('translate-desc-button').addEventListener('click', async () => {
        if (!currentlySelectedBggId) return;

        const summaryContainer = document.getElementById('ai-summary-container');
        if (!summaryContainer) return;

        // Get the English source text from game_summaries or fallback to games.description
        const sumSnap = await summariesCollectionRef.doc(currentlySelectedBggId).get();
        const sumData = sumSnap.exists ? sumSnap.data() : {};
        let sourceText = (sumData && sumData.description_en) ? sumData.description_en : null;
        if (!sourceText) {
            const gameDoc = await gamesCollectionRef.doc(currentlySelectedBggId).get();
            if (gameDoc.exists && gameDoc.data() && gameDoc.data().description) {
                sourceText = gameDoc.data().description;
            }
        }
        if (!sourceText || !String(sourceText).trim()) {
            alert('No English description available to translate.');
            return;
        }

        if (!confirm('Translate the English description into German?')) return;

        summaryContainer.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Translating...</span></div> Translating...';

        try {
            const prompt = `You are a translator that must return ONLY a single, well-formed HTML fragment (UTF-8) and nothing else — no explanations, no markdown, no code fences. Use only these tags: <div class="description">, <p>, <strong>, <em>, <ul>, <li>. Preserve the original HTML structure and attributes; translate text nodes from English to German but do not alter tags or attributes. Do not include scripts, comments, or external resources. Keep punctuation and list markers as plain text inside the tags. Here is the English HTML to translate (translate text nodes only):\n\n${sourceText}`;
            const functionUrl = "https://us-central1-boardgameapp-cc741.cloudfunctions.net/generateAiSummary";
            const response = await fetch(functionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: prompt })
            });
            if (!response.ok) throw new Error(`Cloud Function error: ${response.status}`);
            const data = await response.json();
            const translation = data.summary || data.translation || '';

            // Save translation into game_summaries.description_de (overwrite as requested)
            await summariesCollectionRef.doc(currentlySelectedBggId).set({ description_de: translation, description_meta: { translatedAt: firebase.firestore.FieldValue.serverTimestamp(), translatedBy: 'ai', sourceLang: 'en', targetLang: 'de' } }, { merge: true });

            // Update UI
            summaryContainer.innerHTML = `<p><strong>${translations.description_heading || 'Description:'}</strong> ${translation} <span class="badge bg-secondary ms-2">${translations.auto_translated_badge || 'Auto-translated'}</span></p>`;
            // Ensure buttons are synced
            try { await updateDescriptionButtons(currentlySelectedBggId); } catch(_){}
        } catch (err) {
            console.error('Translation error:', err);
            summaryContainer.innerHTML = `<p class="text-danger">Translation failed. See console for details.</p>`;
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

        // Verify attendance before allowing a NEW vote
        // (Allow removing an existing vote regardless of attendance)
        const isRemovingVote = e.target.classList.contains('voted');
        if (!isRemovingVote) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const eventSnap = await eventsCollectionRef
                    .where('date', '>=', today)
                    .orderBy('date', 'asc')
                    .limit(1)
                    .get();
                
                let canVote = false;
                if (!eventSnap.empty) {
                    const nextEvent = eventSnap.docs[0].data();
                    if (nextEvent.attendees && nextEvent.attendees.includes(currentUser)) {
                        canVote = true;
                    }
                }

                if (!canVote) {
                    alert('You must be registered as attending the next game night to vote.');
                    return;
                }
            } catch (err) {
                console.error("Error verifying attendance:", err);
                alert('Could not verify attendance status.');
                return;
            }
        }

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

        // If no active group is selected, prompt the admin to choose/join a group
        if (!activeGroupId || activeGroupId === 'default') {
            try {
                if (groupModal) {
                    // Optionally set a status message inside the group modal explaining why it opened
                    if (groupModalStatus) groupModalStatus.textContent = translations.choose_group_prompt || 'Please join or select a group to manage its shortlist.';
                    groupModal.show();
                } else {
                    alert('Please select a group before modifying the shortlist.');
                }
            } catch (err) {
                console.error('Could not open group modal:', err);
                alert('Please select a group before modifying the shortlist.');
            }
            return;
        }

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
    document.getElementById('upload-collection-button').addEventListener('click', async () => {
        if (currentUser !== adminUser) {
            alert('Only the admin can upload collection files.');
            return;
        }

        const fileInput = document.getElementById('xml-file-input');
        if (!fileInput.files.length) {
            alert('Please select an XML file to upload.');
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();
        const uploadStatusDiv = document.getElementById('upload-status');
        uploadStatusDiv.innerHTML = '<div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Uploading...</span></div> Uploading...';

        reader.onload = async (e) => {
            try {
                const xmlText = e.target.result;
                const newGames = parseBggXml(xmlText);
                const newGameBggIds = new Set(newGames.map(game => game.bggId));

                // 1. Get all existing game BGG IDs from Firestore
                const existingGamesSnapshot = await gamesCollectionRef.get();
                const existingGameBggIds = new Set();
                existingGamesSnapshot.forEach(doc => {
                    existingGameBggIds.add(doc.id);
                });

                const batch = db.batch();
                let gamesAdded = 0;
                let gamesUpdated = 0;
                let gamesRemoved = 0;

                // 2. Identify and delete games no longer in the new XML
                const gamesToDelete = [...existingGameBggIds].filter(id => !newGameBggIds.has(id));
                for (const bggId of gamesToDelete) {
                    batch.delete(gamesCollectionRef.doc(bggId));
                    gamesRemoved++;
                }

                // 3. Add/Update games from the new XML
                newGames.forEach(game => {
                    const gameRef = gamesCollectionRef.doc(game.bggId);

                    // Remove 'description' from the `games` collection payload; we'll store
                    // the English description in the separate `game_summaries` collection.
                    const gameForGamesCollection = { ...game };
                    if (gameForGamesCollection.hasOwnProperty('description')) {
                        delete gameForGamesCollection.description;
                    }

                    // Write the main game document (without description)
                    batch.set(gameRef, gameForGamesCollection, { merge: true });

                    // If the XML provided a description, save it into game_summaries/{bggId}.description_en
                    if (game.description && String(game.description).trim()) {
                        const sumRef = summariesCollectionRef.doc(game.bggId);
                        batch.set(sumRef, { description_en: game.description }, { merge: true });
                    }

                    if (existingGameBggIds.has(game.bggId)) {
                        gamesUpdated++;
                    } else {
                        gamesAdded++;
                    }
                });

                await batch.commit();
                uploadStatusDiv.innerHTML = `<p class="text-success">Upload complete! Added: ${gamesAdded}, Updated: ${gamesUpdated}, Removed: ${gamesRemoved} games.</p>`;
                fetchAndDisplayGames(); // Refresh the collection view
            } catch (error) {
                console.error('Error uploading BGG collection:', error);
                uploadStatusDiv.innerHTML = `<p class="text-danger">Error uploading collection: ${error.message}</p>`;
            }
        };

        reader.onerror = () => {
            uploadStatusDiv.innerHTML = '<p class="text-danger">Error reading file.</p>';
        };

        reader.readAsText(file);
    });

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
                    const editBtn = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-primary ms-2 edit-event-button" data-id="${doc.id}">Edit</button>` : '';
                    const removeBtn = (currentUser === adminUser) ? `<button class="btn btn-sm btn-outline-danger ms-2 remove-event-button" data-id="${doc.id}">Delete</button>` : '';
                    
                    // Attendance Logic
                    const attendees = e.attendees || [];
                    const isAttending = currentUser && attendees.includes(currentUser);
                    const attendBtnText = isAttending ? (translations.cancel_attendance || 'Cancel Attendance') : (translations.attend || 'Attend');
                    const attendBtnClass = isAttending ? 'btn-outline-secondary' : 'btn-primary';
                    const attendBtnAction = isAttending ? 'cancel-attendance' : 'attend-event';
                    
                    // Visual cue for attendance
                    const attendingBadge = isAttending ? `<span class="badge bg-success ms-2">${translations.attending_badge || 'Attending ✓'}</span>` : '';

                    // Only show attend button if logged in
                    const attendBtn = currentUser ? 
                        `<button class="btn btn-sm ${attendBtnClass} ms-2 ${attendBtnAction}-button" data-id="${doc.id}">${attendBtnText}</button>` : '';

                    const attendeesList = attendees.length > 0 ? 
                        `<div class="small text-muted mt-2"><strong>${translations.attendees || 'Attendees'}:</strong> ${attendees.join(', ')}</div>` : '';

                    html += `<div id="event-${doc.id}" class="list-group-item d-flex justify-content-between align-items-start ${isAttending ? 'list-group-item-success' : ''}" data-event-id="${doc.id}" style="${isAttending ? '--bs-bg-opacity: .1;' : ''}">
                        <div class="w-100">
                            <div class="d-flex justify-content-between">
                                <div class="fw-bold">
                                    ${e.title}
                                    ${attendingBadge}
                                </div>
                                <div>
                                    ${attendBtn}
                                    ${editBtn}
                                    ${removeBtn}
                                </div>
                            </div>
                            <div class="text-muted">${when} — ${e.location || ''}</div>
                            <div class="small text-muted">Created by: ${e.createdBy || 'unknown'}</div>
                            ${attendeesList}
                        </div>
                    </div>`;
                });
                html += '</div>';
                list.innerHTML = html;
                // If navigated from the next-game widget, highlight and scroll to the selected event
                try {
                    const selectedId = sessionStorage.getItem('selected_event_id');
                    if (selectedId) {
                        const el = document.getElementById(`event-${selectedId}`);
                        if (el) {
                            // smooth scroll and add highlight class
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('highlighted-event');
                            // remove highlight after a short delay
                            setTimeout(() => el.classList.remove('highlighted-event'), 3000);
                        }
                        sessionStorage.removeItem('selected_event_id');
                    }
                } catch (err) {
                    console.warn('Could not navigate to selected event:', err);
                }
            }, err => {
                console.error('Error fetching events:', err);
                list.innerHTML = '<p class="text-danger">Could not load events.</p>';
            });
        }        // Create/Edit Event
        document.getElementById('save-event-button').addEventListener('click', async (e) => {
            if (!currentUser) { alert('Please login to create events.'); return; }
            const title = document.getElementById('event-title').value.trim();
            const date = document.getElementById('event-date').value;
            const time = document.getElementById('event-time').value;
            const location = document.getElementById('event-location').value.trim();
            if (!title || !date) { alert('Please provide a title and date.'); return; }
            
            const editingId = e.target.dataset.editingId;

            try {
                if (editingId) {
                    // Update existing event
                    await eventsCollectionRef.doc(editingId).update({ title, date, time, location });
                } else {
                    // Create new event
                    await eventsCollectionRef.add({ title, date, time, location, createdBy: currentUser, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                }
                
                // close modal
                const modalEl = document.getElementById('create-event-modal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                // clear inputs and reset state
                document.getElementById('event-title').value = '';
                document.getElementById('event-date').value = '';
                document.getElementById('event-time').value = '';
                document.getElementById('event-location').value = '';
                delete e.target.dataset.editingId;
                document.querySelector('#create-event-modal .modal-title').textContent = translations.modal_create_event_title || 'Create New Event';
                e.target.textContent = translations.modal_create_event_button || 'Create Event';
            } catch (err) {
                console.error('Error saving event:', err);
                alert('Could not save event.');
            }
        });

        // Reset modal state when opening for creation
        document.getElementById('create-event-button').addEventListener('click', () => {
            document.getElementById('event-title').value = '';
            document.getElementById('event-date').value = '';
            document.getElementById('event-time').value = '';
            document.getElementById('event-location').value = '';
            const saveBtn = document.getElementById('save-event-button');
            delete saveBtn.dataset.editingId;
            document.querySelector('#create-event-modal .modal-title').textContent = translations.modal_create_event_title || 'Create New Event';
            saveBtn.textContent = translations.modal_create_event_button || 'Create Event';
        });

        // Event actions (delete, attend, cancel, edit)
        document.getElementById('events-list').addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (!id) return;

            if (e.target.classList.contains('remove-event-button')) {
                try {
                    await eventsCollectionRef.doc(id).delete();
                } catch (err) {
                    console.error('Error deleting event:', err);
                    alert('Could not delete event.');
                }
            } else if (e.target.classList.contains('edit-event-button')) {
                try {
                    const doc = await eventsCollectionRef.doc(id).get();
                    if (doc.exists) {
                        const data = doc.data();
                        document.getElementById('event-title').value = data.title || '';
                        document.getElementById('event-date').value = data.date || '';
                        document.getElementById('event-time').value = data.time || '';
                        document.getElementById('event-location').value = data.location || '';
                        
                        const saveBtn = document.getElementById('save-event-button');
                        saveBtn.dataset.editingId = id;
                        document.querySelector('#create-event-modal .modal-title').textContent = translations.modal_edit_event_title || 'Edit Event';
                        saveBtn.textContent = translations.modal_update_event_button || 'Update Event';
                        
                        const modal = new bootstrap.Modal(document.getElementById('create-event-modal'));
                        modal.show();
                    }
                } catch (err) {
                    console.error('Error fetching event for edit:', err);
                    alert('Could not load event details.');
                }
            } else if (e.target.classList.contains('attend-event-button')) {
                if (!currentUser) { alert('Please login to attend.'); return; }
                try {
                    await eventsCollectionRef.doc(id).update({
                        attendees: firebase.firestore.FieldValue.arrayUnion(currentUser)
                    });
                } catch (err) {
                    console.error('Error attending event:', err);
                    alert('Could not update attendance.');
                }
            } else if (e.target.classList.contains('cancel-attendance-button')) {
                if (!currentUser) { alert('Please login.'); return; }
                try {
                    await eventsCollectionRef.doc(id).update({
                        attendees: firebase.firestore.FieldValue.arrayRemove(currentUser)
                    });
                } catch (err) {
                    console.error('Error cancelling attendance:', err);
                    alert('Could not update attendance.');
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

    // Fetch global config
    async function fetchConfig() {
        try {
            const doc = await configCollectionRef.doc('general').get();
            if (doc.exists) {
                const data = doc.data();
                if (typeof data.showLoginDropdown !== 'undefined') {
                    showLoginDropdown = data.showLoginDropdown;
                }
                if (typeof data.chatbotEnabled !== 'undefined') {
                    chatbotEnabled = data.chatbotEnabled;
                }
            }
            
            // Update Login UI
            if (existingUsersDropdown) {
                existingUsersDropdown.classList.toggle('d-none', !showLoginDropdown);
            }

            // Update Admin UI Toggle
            const toggle = document.getElementById('login-dropdown-toggle');
            if (toggle) {
                toggle.checked = showLoginDropdown;
            }

            // Update Chatbot toggle and UI visibility
            const chatToggle = document.getElementById('chatbot-enabled-toggle');
            const chatbotEl = document.getElementById('chatbot-container');
            if (chatToggle) chatToggle.checked = !!chatbotEnabled;
            if (chatbotEl) chatbotEl.style.display = chatbotEnabled ? '' : 'none';

            // Ensure login label/placeholder reflect current dropdown visibility
            try { updateLoginLabelBasedOnDropdown(); } catch (e) {}

        } catch (err) {
            console.error('Error fetching config:', err);
        }
    }

    // Admin: Toggle Login Dropdown
    const loginDropdownToggle = document.getElementById('login-dropdown-toggle');
    if (loginDropdownToggle) {
        loginDropdownToggle.addEventListener('change', async (e) => {
            const newValue = e.target.checked;
            try {
                await configCollectionRef.doc('general').set({ showLoginDropdown: newValue }, { merge: true });
                showLoginDropdown = newValue;
                // Update Login UI immediately
                if (existingUsersDropdown) {
                    existingUsersDropdown.classList.toggle('d-none', !showLoginDropdown);
                    try { updateLoginLabelBasedOnDropdown(); } catch (e) {}
                }
            } catch (err) {
                console.error('Error updating config:', err);
                alert('Could not update setting.');
                // Revert toggle if failed
                e.target.checked = !newValue;
            }
        });
    }

    // Admin: Toggle Chatbot Enabled
    const chatbotToggleEl = document.getElementById('chatbot-enabled-toggle');
    if (chatbotToggleEl) {
        chatbotToggleEl.addEventListener('change', async (e) => {
            const newValue = e.target.checked;
            try {
                await configCollectionRef.doc('general').set({ chatbotEnabled: newValue }, { merge: true });
                chatbotEnabled = newValue;
                const chatbotEl = document.getElementById('chatbot-container');
                if (chatbotEl) chatbotEl.style.display = chatbotEnabled ? '' : 'none';
            } catch (err) {
                console.error('Error updating chatbot config:', err);
                alert('Could not update setting.');
                e.target.checked = !newValue;
            }
        });
    }

    // Admin: Export full collection to Firestore (JSON or XML)
    async function exportCollectionAs(format) {
        if (currentUser !== adminUser) { alert('Only admin can export the collection.'); return; }
        try {
            const snap = await gamesCollectionRef.get();
            if (snap.empty) { alert('No games to export.'); return; }
            const games = snap.docs.map(d => d.data());

            let payload = '';
            if (format === 'json') {
                payload = JSON.stringify(games, null, 2);
            } else {
                // Build simple XML
                const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
                payload = '<games>\n';
                for (const g of games) {
                    payload += '  <game>\n';
                    payload += `    <bggId>${esc(g.bggId)}</bggId>\n`;
                    payload += `    <name>${esc(g.name)}</name>\n`;
                    payload += `    <minPlayers>${esc(g.minPlayers)}</minPlayers>\n`;
                    payload += `    <maxPlayers>${esc(g.maxPlayers)}</maxPlayers>\n`;
                    payload += `    <playingTime>${esc(g.playingTime || g.playtime)}</playingTime>\n`;
                    payload += `    <year>${esc(g.year)}</year>\n`;
                    payload += `    <image>${esc(g.image)}</image>\n`;
                    payload += `    <description>${esc(g.description)}</description>\n`;
                    payload += '  </game>\n';
                }
                payload += '</games>';
            }

            const ts = new Date().toISOString().replace(/[:.]/g,'-');
            const dest = db.collection('exports').doc('collections').collection('snapshots').doc(ts);
            await dest.set({ format, createdAt: firebase.firestore.FieldValue.serverTimestamp(), payload });
            alert(`Export saved (${format.toUpperCase()}) as exports/collections/snapshots/${ts}`);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. See console for details.');
        }
    }

    // Wire export buttons
    const exportJsonBtn = document.getElementById('export-collection-json');
    const exportXmlBtn = document.getElementById('export-collection-xml');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => exportCollectionAs('json'));
    if (exportXmlBtn) exportXmlBtn.addEventListener('click', () => exportCollectionAs('xml'));

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

            // Show/Hide based on config
            existingUsersDropdown.classList.toggle('d-none', !showLoginDropdown);
            console.log('existingUsersDropdown visibility updated based on config.');
            try { updateLoginLabelBasedOnDropdown(); } catch (e) {}
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
                const userData = doc.data();
                const hasPassword = userData && userData.hasPassword === true;
                if (username === adminUser) return; // Don't allow deleting the admin user
                html += `<div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${username} ${hasPassword ? '🔐' : ''}</span>
                    <div>
                        <button class="btn btn-sm btn-outline-warning me-1 reset-password-button" data-username="${username}" data-has-password="${hasPassword}" title="Reset/Set Password" aria-label="Reset or set password for ${username}">${hasPassword ? '🔒' : '🔓'}</button>
                        <button class="btn btn-sm btn-outline-danger delete-user-button" data-username="${username}">Delete</button>
                    </div>
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
            
            // Handle Reset/Set Password button
            if (e.target.classList.contains('reset-password-button')) {
                if (currentUser !== adminUser) { alert('Only the admin can reset or set passwords.'); return; }
                const usernameToReset = e.target.dataset.username;
                const hasPassword = e.target.dataset.hasPassword === 'true';
                if (!usernameToReset) return;

                if (hasPassword) {
                    // User has a password: confirm reset (remove password)
                    if (!confirm(`Reset password for "${usernameToReset}"? They will be able to log in without a password.`)) return;
                    try {
                        await usersCollectionRef.doc(usernameToReset).update({
                            hasPassword: false,
                            passwordHash: firebase.firestore.FieldValue.delete(),
                            passwordSalt: firebase.firestore.FieldValue.delete()
                        });
                        alert(`Password reset for "${usernameToReset}". They can now log in without a password.`);
                        fetchAndDisplayUsers(); // Refresh the list
                    } catch (err) {
                        console.error('Error resetting password:', err);
                        alert('Could not reset password.');
                    }
                } else {
                    // No password: open Set Password modal to let admin set one for the user
                    adminTargetUser = usernameToReset;
                    const modalEl = document.getElementById('set-password-modal');
                    if (modalEl) {
                        document.getElementById('set-password-input').value = '';
                        document.getElementById('set-password-confirm').value = '';
                        document.getElementById('set-password-status').textContent = '';
                        document.getElementById('set-password-modal-label').textContent = `Set Password for ${usernameToReset}`;
                        const modal = new bootstrap.Modal(modalEl);
                        modal.show();
                    }
                }
                return;
            }

            // Handle Delete User (open confirm modal)
            if (!e.target.classList.contains('delete-user-button')) return;
            if (currentUser !== adminUser) { alert('Only the admin can delete users.'); return; }
            const usernameToDelete = e.target.dataset.username;
            if (!usernameToDelete) return;
            const confirmModalEl = document.getElementById('confirm-delete-modal');
            if (confirmModalEl) {
                confirmModalEl.dataset.username = usernameToDelete;
                document.getElementById('confirm-delete-text').textContent = `Are you sure you want to delete user "${usernameToDelete}"? This will remove their wishlist and votes.`;
                const cm = new bootstrap.Modal(confirmModalEl);
                cm.show();
            }
        });
    }

    // Confirm delete modal handler
    const confirmDeleteYesBtn = document.getElementById('confirm-delete-yes');
    if (confirmDeleteYesBtn) {
        confirmDeleteYesBtn.addEventListener('click', async () => {
            const confirmModalEl = document.getElementById('confirm-delete-modal');
            if (!confirmModalEl) return;
            const usernameToDelete = confirmModalEl.dataset.username;
            if (!usernameToDelete) return;
            try {
                // Close modal
                try { const mi = bootstrap.Modal.getInstance(confirmModalEl); if (mi) mi.hide(); } catch (e) {}
                // Fetch all polls BEFORE the transaction starts
                const pollsSnapshot = await pollsCollectionRef.get();
                await db.runTransaction(async (transaction) => {
                    const userWishlistRef = userWishlistsCollectionRef.doc(usernameToDelete);
                    transaction.delete(userWishlistRef);
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
                    const userRef = usersCollectionRef.doc(usernameToDelete);
                    transaction.delete(userRef);
                });
                alert(`User '${usernameToDelete}' and all associated data deleted.`);
                fetchUsernames();
                fetchAndDisplayUsers();
            } catch (err) {
                console.error('Error deleting user:', err);
                alert('Could not delete user.');
            }
        });
    }

    // Modify updateUserDisplay to call fetchAndDisplayUsers when admin logs in
    // --- App Initialization ---
    // Load translations first, then initialize UI so translated strings are applied
    const savedLang = localStorage.getItem('bgg_lang') || 'de';
    (async () => {
        await loadTranslations(savedLang);
        await verifyInitialActiveGroup();
        await fetchConfig();
        // Ensure the language switcher reflects the chosen default
        try {
            const ls = document.getElementById('language-switcher');
            if (ls) ls.value = savedLang;
        } catch (e) {}
        updateUserDisplay();
        // Ensure the saved layout is applied on initial load so large/small/list render correctly
        applyLayout(currentLayout);
        handleHashChange(); // Handle initial load based on URL hash
        // Populate usernames dropdown after translations are loaded
        try { await fetchUsernames(); } catch (e) {}
        // Ensure login label is correct after we fetched config and usernames
        try { updateLoginLabelBasedOnDropdown(); } catch (e) {}
    })();

    // Initial fetch for polls when events view might be active or navigated to
    // This is now handled by handleHashChange and showView functions

    // Ensure polls are fetched when navigating to events view
    // This is now handled by showView function

    // --- Set Password Modal Handler ---
    const setPasswordSaveBtn = document.getElementById('set-password-save');
    if (setPasswordSaveBtn) {
        setPasswordSaveBtn.addEventListener('click', async () => {
            const passwordInput = document.getElementById('set-password-input');
            const confirmInput = document.getElementById('set-password-confirm');
            const statusEl = document.getElementById('set-password-status');
            
            const password = passwordInput.value;
            const confirm = confirmInput.value;
            
            // Clear password (optional)
            if (!password && !confirm) {
                try {
                    // Remove password by setting hasPassword to false
                    await usersCollectionRef.doc(currentUser).update({
                        hasPassword: false,
                        passwordHash: firebase.firestore.FieldValue.delete(),
                        passwordSalt: firebase.firestore.FieldValue.delete()
                    });
                    statusEl.textContent = '';
                    statusEl.classList.remove('text-danger');
                    statusEl.classList.add('text-success');
                    statusEl.textContent = 'Password removed!';
                        setTimeout(() => {
                            try { const mi = bootstrap.Modal.getInstance(document.getElementById('set-password-modal')); if (mi) mi.hide(); } catch (e) {}
                        }, 1000);
                } catch (err) {
                    console.error('Error removing password:', err);
                    statusEl.textContent = 'Could not remove password.';
                }
                return;
            }
            
            // Validate password
            if (password.length < 4) {
                statusEl.textContent = 'Password must be at least 4 characters.';
                return;
            }
            
            if (password !== confirm) {
                statusEl.textContent = 'Passwords do not match.';
                return;
            }
            
            // Call Cloud Function to set password
            try {
                statusEl.textContent = 'Saving...';
                statusEl.classList.remove('text-danger');
                // Use adminTargetUser if admin is setting password for another user
                const targetUser = adminTargetUser || currentUser;
                await setPasswordFn({ username: targetUser, password });
                statusEl.classList.add('text-success');
                statusEl.textContent = 'Password saved!';
                setTimeout(() => {
                    try { const mi = bootstrap.Modal.getInstance(document.getElementById('set-password-modal')); if (mi) mi.hide(); } catch (e) {}
                    // Reset adminTargetUser and refresh list if admin set for another user
                    if (adminTargetUser) {
                        adminTargetUser = null;
                        fetchAndDisplayUsers();
                    }
                }, 1000);
            } catch (err) {
                console.error('Error setting password:', err);
                statusEl.classList.add('text-danger');
                statusEl.textContent = 'Could not save password. Please try again.';
            }
        });
    }

    // Change Username handler
    const changeUsernameSaveBtn = document.getElementById('change-username-save');
    if (changeUsernameSaveBtn) {
        changeUsernameSaveBtn.addEventListener('click', async () => {
            const newName = (document.getElementById('change-username-input').value || '').trim();
            const statusEl = document.getElementById('change-username-status');
            if (!newName) { statusEl.textContent = 'Please enter a new username.'; return; }
            if (newName === currentUser) { statusEl.textContent = 'That is already your username.'; return; }
            try {
                // Check if new username already exists
                const newDoc = await usersCollectionRef.doc(newName).get();
                if (newDoc.exists) { statusEl.textContent = 'Username already taken.'; return; }
                // Fetch polls snapshot to update votes
                const pollsSnapshot = await pollsCollectionRef.get();
                // Fetch wishlist (if any)
                const wishlistDoc = await userWishlistsCollectionRef.doc(currentUser).get();
                // Run transaction to move docs and update polls
                await db.runTransaction(async (transaction) => {
                    // create new user doc
                    transaction.set(usersCollectionRef.doc(newName), { createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                    // move wishlist
                    if (wishlistDoc.exists) {
                        transaction.set(userWishlistsCollectionRef.doc(newName), wishlistDoc.data());
                        transaction.delete(userWishlistsCollectionRef.doc(currentUser));
                    }
                    // update polls voters
                    pollsSnapshot.forEach(pollDoc => {
                        const pollRef = pollsCollectionRef.doc(pollDoc.id);
                        const pollData = pollDoc.data();
                        if (pollData.options) {
                            const updatedOptions = pollData.options.map(option => ({
                                ...option,
                                voters: option.voters.map(v => v === currentUser ? newName : v)
                            }));
                            transaction.update(pollRef, { options: updatedOptions });
                        }
                    });
                    // delete old user doc
                    transaction.delete(usersCollectionRef.doc(currentUser));
                });
                // update local state and UI
                localStorage.setItem('bgg_username', newName);
                currentUser = newName;
                updateUserDisplay();
                fetchUsernames();
                fetchAndDisplayUsers();
                try { const mi = bootstrap.Modal.getInstance(document.getElementById('change-username-modal')); if (mi) mi.hide(); } catch (e) {}
            } catch (err) {
                console.error('Error changing username:', err);
                statusEl.textContent = 'Could not change username.';
            }
        });
    }

    // --- Localization Initialization ---
    const languageSwitcher = document.getElementById('language-switcher');
    if (languageSwitcher) languageSwitcher.addEventListener('change', async (e) => {
        const lang = e.target.value;
        localStorage.setItem('bgg_lang', lang);
        await loadTranslations(lang);
        try { updateLoginLabelBasedOnDropdown(); } catch (e) {}
    });

    // Update the login label and placeholder depending on whether the
    // existing-users dropdown is visible. When the dropdown is hidden,
    // show the simpler prompt requested by the user.
    function updateLoginLabelBasedOnDropdown() {
        try {
            const labelEl = document.querySelector('label[for="username-input"]');
            if (!labelEl || !usernameInput) return;
            const dropdownHidden = existingUsersDropdown ? existingUsersDropdown.classList.contains('d-none') : !showLoginDropdown;
            if (dropdownHidden) {
                // Use the 'simple' translations when dropdown is hidden
                labelEl.textContent = translations.login_username_label_simple || 'enter your username';
                usernameInput.placeholder = translations.login_username_placeholder_simple || 'Enter username';
            } else {
                // Restore translated text if available, otherwise fall back to defaults
                labelEl.textContent = translations.login_username_label || 'Enter your username or select existing';
                usernameInput.placeholder = translations.login_username_placeholder || 'Enter new username';
            }
        } catch (e) {
            console.warn('Could not update login label based on dropdown visibility', e);
        }
    }

    // Global modal cleanup: ensure backdrop and 'modal-open' are cleared if modals close unexpectedly
    document.addEventListener('hidden.bs.modal', () => {
        // Small delay to allow bootstrap to clean up; if anything remains, remove it.
        setTimeout(() => {
            const anyOpen = document.querySelectorAll('.modal.show').length > 0;
            if (!anyOpen) {
                document.body.classList.remove('modal-open');
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            }
        }, 50);
    });
});
