document.addEventListener('DOMContentLoaded', async () => {
    const toggle = document.getElementById('chatbot-toggle');
    const panel = document.getElementById('chatbot-panel');
    const closeBtn = document.getElementById('chatbot-close');
    const messagesEl = document.getElementById('chatbot-messages');
    const inputEl = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');

    if (!toggle || !panel || !messagesEl || !inputEl || !sendBtn) return;

    // Load chatbot-specific translations so UI strings here match the app language
    let chatbotTranslations = {};
    async function loadChatbotTranslations(lang) {
        try {
            const res = await fetch(`locales/${lang}.json`);
            if (!res.ok) return;
            const all = await res.json();
            // pick only chatbot-related keys (but keep full object for simplicity)
            chatbotTranslations = all || {};
        } catch (e) { /* ignore */ }
    }
    // determine initial lang (fall back to navigator)
    const initialLang = (localStorage.getItem('bgg_lang') || (navigator.language || 'en')).toLowerCase().startsWith('de') ? 'de' : 'en';
    await loadChatbotTranslations(initialLang);

    // Apply translations to DOM attributes/text that aren't covered by the main app i18n flow
    try {
        if (panel && chatbotTranslations.chatbot_panel_label) panel.setAttribute('aria-label', chatbotTranslations.chatbot_panel_label);
        if (sendBtn && chatbotTranslations.chatbot_send_button) sendBtn.textContent = chatbotTranslations.chatbot_send_button;
    } catch (e) { /* ignore */ }

    function openPanel() { panel.classList.remove('d-none'); inputEl.focus(); }
    async function closePanel() {
        panel.classList.add('d-none');
        // When the chat panel closes, delete stored conversation messages client-side via Firestore
        try {
            if (chatState && chatState.conversationId && typeof db !== 'undefined' && db) {
                const convoId = chatState.conversationId;
                const chatCol = db.collection('ai_chats').doc(convoId).collection('messages');
                const snap = await chatCol.get();
                const batch = db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                // delete parent doc if present
                try { await db.collection('ai_chats').doc(convoId).delete(); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.warn('Could not delete conversation on close (client):', e);
        }
        // Clear local state
        chatState.conversationId = null;
        chatState.messages = [ { role: 'system', content: (chatState.messages && chatState.messages[0]) ? chatState.messages[0].content : buildSystemInstruction(getUiLang()) } ];
        try { localStorage.removeItem('chatbot_conversation_id'); localStorage.removeItem('chatbot_messages'); } catch (_) {}
    }

    toggle.addEventListener('click', () => {
        if (panel.classList.contains('d-none')) openPanel(); else closePanel();
    });
    closeBtn.addEventListener('click', closePanel);

    // Helper: append message
    function appendMessage(who, text) {
        const m = document.createElement('div');
        m.className = `msg ${who}`;
        const b = document.createElement('div');
        b.className = 'bubble';
        b.textContent = text;
        m.appendChild(b);
        messagesEl.appendChild(m);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendBotHtml(html) {
        const m = document.createElement('div');
        m.className = 'msg bot';
        const cont = document.createElement('div');
        cont.innerHTML = html;
        m.appendChild(cont);
        messagesEl.appendChild(m);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Minimal chat-only client: scoring/matching removed.
    // The chatbot sends the user's raw input to the LLM (generateAiChatV2) and displays the assistant reply.

    // session chat state (keeps small history for this browser tab)
    let chatState = {
        conversationId: localStorage.getItem('chatbot_conversation_id') || null,
        messages: null
    };
    // load persisted messages if available
    try {
        const stored = localStorage.getItem('chatbot_messages');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length) chatState.messages = parsed;
        }
    } catch (e) { /* ignore */ }
    if (!chatState.messages) {
        chatState.messages = [ { role: 'system', content: buildSystemInstruction(getUiLang()) } ];
    }

    // Detect UI language and keep it available. If `localStorage.bgg_lang` isn't set, infer from the browser.
    function detectAndSetUiLang() {
        try {
            let stored = localStorage.getItem('bgg_lang');
            if (stored) return stored.toLowerCase();
            const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
            const deduced = nav.startsWith('de') ? 'de' : 'en';
            try { localStorage.setItem('bgg_lang', deduced); } catch (e) { /* ignore */ }
            return deduced;
        } catch (e) { return 'en'; }
    }

    function getUiLang() {
        try { return (localStorage.getItem('bgg_lang') || detectAndSetUiLang()).toLowerCase(); } catch (e) { return 'en'; }
    }

    function buildSystemInstruction(uiLang) {
        const enforceLangLine = uiLang === 'de'
            ? (chatbotTranslations.chatbot_enforce_de || 'Respond ONLY in German.')
            : (chatbotTranslations.chatbot_enforce_en || 'Respond ONLY in English.');
        return `You are a game enthusiast helping the user choose a game to play. ONLY use the provided catalog data below — do NOT invent games or details not present in the catalog. Keep replies short (around 3 sentences). No markdown. ${enforceLangLine}`;
    }

    // Listen for changes to the UI language (from other tabs or parts of the app) and update the system message.
    window.addEventListener('storage', (e) => {
        if (!e) return;
        if (e.key === 'bgg_lang') {
            try {
                const lang = getUiLang();
                if (chatState && chatState.messages && chatState.messages.length) {
                    chatState.messages[0].content = buildSystemInstruction(lang);
                    try { localStorage.setItem('chatbot_messages', JSON.stringify(chatState.messages)); } catch (ex) { /* ignore */ }
                }
            } catch (ex) { /* ignore */ }
        }
    });

    // Use the existing HTTP function `generateAiSummary` (same contract as app.js)
    function buildPromptFromMessages(messages) {
        // Use the system message (if present) as instruction, then include the last few messages
        const system = (messages && messages.length && messages[0].role === 'system') ? messages[0].content : '';
        // include up to the last 6 user/assistant exchanges
        const recent = (messages || []).slice(-12).filter(m => m.role !== 'system');
        let body = '';
        if (system) body += system + '\n\n';
        recent.forEach(m => {
            const role = m.role === 'assistant' ? 'Assistant' : 'User';
            body += `${role}: ${m.content}\n`;
        });
        body += '\nINSTRUCTIONS: ' + (chatbotTranslations.chatbot_instruction_suffix || 'Reply concisely (about 3 sentences). NEVER invent facts. No markdown. Provide grounded recommendations or ask a short clarifying question if needed.');
        return body;
    }

    async function callAiChat(messages, conversationId, model) {
        if (!(firebase && firebase.functions)) throw new Error('Firebase functions SDK not available');
        const fn = firebase.functions().httpsCallable('generateAiChatV2');
        const res = await fn({ messages, conversationId, model });
        if (res && res.data) {
            // If server returned structured error payload, throw it so UI shows it
            if (res.data.error) {
                const details = res.data.details ? ` — ${res.data.details}` : '';
                throw new Error(`${res.data.error}${details}`);
            }
            if (res.data.conversationId) {
                chatState.conversationId = res.data.conversationId;
                try { localStorage.setItem('chatbot_conversation_id', chatState.conversationId); } catch (e) { /* ignore */ }
            }
            return res.data.summary || res.data.reply || '';
        }
        throw new Error('No data from callable function');
    }

    async function handleQuery(q) {
        if (!q || !q.trim()) return;
        // show user's message
        appendMessage('user', q);

        // append to conversation history and persist
        chatState.messages.push({ role: 'user', content: String(q) });
        try { localStorage.setItem('chatbot_messages', JSON.stringify(chatState.messages)); } catch (e) { /* ignore */ }
        appendBotHtml('<div class="chatbot-result">' + (chatbotTranslations.chatbot_asking || 'Asking the AI…') + '</div>');
        try {
            // Try to include latest exported collection snapshot as a system-context list
            let exportListText = '';
            try {
                const snapCol = db.collection('exports').doc('collections').collection('snapshots').orderBy('createdAt','desc').limit(1);
                const snap = await snapCol.get();
                if (!snap.empty) {
                    const doc = snap.docs[0];
                    const data = doc.data() || {};
                    const format = data.format || 'json';
                    const payload = data.payload || '';
                    // Provide the raw export payload to the model so it sees the full catalog.
                    if (payload && String(payload).trim()) {
                        if (format === 'json') {
                            // include both a parsed list and the full payload for completeness
                            try {
                                const j = JSON.parse(payload);
                                if (Array.isArray(j)) {
                                    const names = j.map(g => g.name || g.title || '').filter(Boolean);
                                    if (names.length) {
                                                exportListText = (chatbotTranslations.chatbot_export_snapshot_json_list || 'Export snapshot (JSON) - list of game names:') + '\n' + names.map(n => `- ${n}`).join('\n') + '\n\n' + (chatbotTranslations.chatbot_export_snapshot_json_full || 'Export snapshot (JSON) - full payload:') + '\n' + JSON.stringify(j, null, 2);
                                            } else {
                                                exportListText = (chatbotTranslations.chatbot_export_snapshot_json_full || 'Export snapshot (JSON) - full payload:') + '\n' + JSON.stringify(j, null, 2);
                                            }
                                } else {
                                    exportListText = (chatbotTranslations.chatbot_export_snapshot_json_full || 'Export snapshot (JSON) - full payload:') + '\n' + JSON.stringify(j, null, 2);
                                }
                            } catch (e) {
                                exportListText = (chatbotTranslations.chatbot_export_snapshot_json_parse_failed || 'Export snapshot (JSON, parse failed):') + '\n' + payload;
                            }
                        } else {
                            // For XML exports, attempt to extract <name> tags into a list, then include full XML
                            try {
                                const m = payload.match(/<name>(.*?)<\/name>/g);
                                if (m && m.length) {
                                    const names = m.map(s => s.replace(/<\/?.*?>/g,'').trim());
                                    exportListText = (chatbotTranslations.chatbot_export_snapshot_xml_list || 'Export snapshot (XML) - list of game names:') + '\n' + names.map(n => `- ${n}`).join('\n') + '\n\n' + (chatbotTranslations.chatbot_export_snapshot_xml_full || 'Export snapshot (XML) - full payload:') + '\n' + payload;
                                } else {
                                    exportListText = (chatbotTranslations.chatbot_export_snapshot_xml_full || 'Export snapshot (XML) - full payload:') + '\n' + payload;
                                }
                            } catch (e) {
                                exportListText = 'Export snapshot (XML) - full payload:\n' + payload;
                            }
                        }
                    }
                }
            } catch (e) { /* ignore export fetch errors */ }

            // Build messages to send: prepend a single system message (instruction + exportListText) so it's first
            const uiLang = getUiLang();
            const langName = uiLang === 'de' ? 'German' : 'English';
            // Strong, explicit language enforcement. Include a short translation in the requested language.
            const enforceLangLine = uiLang === 'de'
                ? 'Respond ONLY in German. Do NOT use English or any other language.\n\nDeutsch: Antworte AUSSCHLIESSLICH auf Deutsch. Verwende kein Englisch.'
                : 'Respond ONLY in English. Do NOT use German or any other language.\n\nDeutsch: Antworte AUSSCHLIESSLICH auf Englisch.';
            const systemInstruction = buildSystemInstruction(uiLang);
            // base messages exclude any existing system messages (we will provide a single merged system message)
            const baseMessages = (chatState.messages || []).filter(m => m.role !== 'system');
            // Prepare lengths for truncation
            let messagesToSend = baseMessages.slice();
            try {
                const existingLen = baseMessages.reduce((acc, m) => acc + (m && m.content ? String(m.content).length : 0), 0);
                const exportLen = exportListText ? String(exportListText).length : 0;
                const LIMIT = 250000; // safe limit under server guard
                let exportContent = exportListText || '';
                    if (existingLen + exportLen > LIMIT && exportContent) {
                    const allowedForExport = Math.max(0, LIMIT - existingLen - 2000);
                    exportContent = String(exportContent).slice(0, allowedForExport) + '\n\n' + (chatbotTranslations.chatbot_export_truncated || '...[truncated output]...');
                }
                const mergedSystem = exportContent ? (systemInstruction + '\n\n' + exportContent) : systemInstruction;
                messagesToSend = [{ role: 'system', content: mergedSystem }, ...baseMessages];
            } catch (e) {
                // fallback: send base messages with a short system instruction
                messagesToSend = [{ role: 'system', content: systemInstruction }, ...baseMessages];
            }

            const llmReply = await callAiChat(messagesToSend, chatState.conversationId, null);
            if (llmReply) {
                chatState.messages.push({ role: 'assistant', content: llmReply });
                try { localStorage.setItem('chatbot_messages', JSON.stringify(chatState.messages)); } catch (e) { /* ignore */ }
            }
            appendBotHtml(`<div class="chatbot-result">${escapeHtml(llmReply).replace(/\n/g,'<br/>')}</div>`);
        } catch (err) {
            const msg = err && err.message ? String(err.message) : 'An error occurred while contacting the AI. Please try again later.';
            appendBotHtml(`<div class="chatbot-result">${(chatbotTranslations.chatbot_error_prefix || 'Error:')} ${escapeHtml(msg)}</div>`);
            console.error('callAiChat error', err);
        }
    }

    sendBtn.addEventListener('click', () => { handleQuery(inputEl.value); inputEl.value = ''; });
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });

    // Small welcome message
    appendBotHtml('<div class="chatbot-result">' + (chatbotTranslations.chatbot_welcome || 'Hi! How can I help you?') + '</div>');

    // util: simple html escape
    function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'\"'}[c]||c)); }
});
