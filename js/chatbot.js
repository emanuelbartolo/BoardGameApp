document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('chatbot-toggle');
    const panel = document.getElementById('chatbot-panel');
    const closeBtn = document.getElementById('chatbot-close');
    const messagesEl = document.getElementById('chatbot-messages');
    const inputEl = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');

    if (!toggle || !panel || !messagesEl || !inputEl || !sendBtn) return;

    function openPanel() { panel.classList.remove('d-none'); inputEl.focus(); }
    function closePanel() { panel.classList.add('d-none'); }

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

    // Wait for window.allGames to be populated by app.js
    function waitForGames(timeoutMs = 5000) {
        return new Promise((resolve) => {
            if (window.allGamesUnfiltered && window.allGamesUnfiltered.length) return resolve(window.allGamesUnfiltered);
            if (window.allGames && window.allGames.length) return resolve(window.allGames);
            const start = Date.now();
            const iv = setInterval(() => {
                if (window.allGamesUnfiltered && window.allGamesUnfiltered.length) {
                    clearInterval(iv); resolve(window.allGamesUnfiltered);
                } else if (window.allGames && window.allGames.length) {
                    clearInterval(iv); resolve(window.allGames);
                } else if (Date.now() - start > timeoutMs) {
                    clearInterval(iv); resolve(window.allGamesUnfiltered || window.allGames || []);
                }
            }, 200);
        });
    }

    function parseQuery(q) {
        const res = { raw: q, tokens: [], players: null, maxPlaytime: null, cooperative: false };
        const s = q.toLowerCase();
        // players ranges
        const rangeMatch = s.match(/(\d+)\s*-\s*(\d+)\s*(players?)?/);
        if (rangeMatch) {
            res.players = { min: parseInt(rangeMatch[1],10), max: parseInt(rangeMatch[2],10) };
        } else {
            const singleMatch = s.match(/(\d+)\s*(players?|p)\b/);
            if (singleMatch) {
                const n = parseInt(singleMatch[1],10);
                res.players = { min: n, max: n };
            }
        }
        // playtime
        const timeMatch = s.match(/(?:<|less than|under)\s*(\d+)\s*(min|minutes)?/);
        if (timeMatch) res.maxPlaytime = parseInt(timeMatch[1],10);
        else {
            const timeMatch2 = s.match(/(\d+)\s*(min|minutes)\b/);
            if (timeMatch2) res.maxPlaytime = parseInt(timeMatch2[1],10);
        }
        if (s.includes('coop') || s.includes('co-op') || s.includes('cooperative')) res.cooperative = true;

        // tokens: strip common stopwords
        const cleaned = s.replace(/[<>(),.!?;:\/\\]/g,' ').replace(/\s+/g,' ').trim();
        const stop = new Set(['for','the','a','an','and','or','with','to','in','of','i','like','want','find','show']);
        cleaned.split(' ').forEach(t => { if (t && !stop.has(t)) res.tokens.push(t); });
        return res;
    }

    // Simple scoring matcher
    function scoreGames(queryObj, games) {
        const scored = [];
        const qtokens = queryObj.tokens || [];
        const wantPlayers = queryObj.players;
        const wantTime = queryObj.maxPlaytime;
        const wantCoop = queryObj.cooperative;

        games.forEach(g => {
            let score = 0;
            const text = ((g.name||'') + ' ' + (g.description||'') + ' ' + (g.year||'')).toLowerCase();
            qtokens.forEach(t => { if (text.includes(t)) score += 2; });

            // players matching
            try {
                const minP = g.minPlayers ? parseInt(g.minPlayers,10) : null;
                const maxP = g.maxPlayers ? parseInt(g.maxPlayers,10) : null;
                if (wantPlayers && minP!=null && maxP!=null) {
                    if (wantPlayers.min >= minP && wantPlayers.max <= maxP) score += 4;
                    else if ((wantPlayers.min <= maxP && wantPlayers.max >= minP)) score += 2; // partial overlap
                }
            } catch(e){}

            // playtime
            try {
                const play = g.playingTime ? parseInt(g.playingTime,10) : (g.playtime ? parseInt(g.playtime,10) : null);
                if (wantTime && play!=null) {
                    if (play <= wantTime) score += 2;
                }
            } catch(e){}

            // cooperative hint
            if (wantCoop) {
                const coopText = text.includes('coop') || text.includes('co-op') || text.includes('cooperative');
                if (coopText) score += 3;
            }

            // small boost for popularity if available
            if (g.averageRating) score += Math.min(2, (parseFloat(g.averageRating)||0)/5);

            scored.push({ game: g, score });
        });
        scored.sort((a,b)=>b.score - a.score);
        return scored;
    }

    async function fetchSummariesFor(ids) {
        const db = firebase.firestore();
        const results = {};
        await Promise.all(ids.map(async id => {
            try {
                const doc = await db.collection('game_summaries').doc(String(id)).get();
                if (doc.exists) results[id] = doc.data();
            } catch (e) { /* ignore */ }
        }));
        return results;
    }

    // Try to load the exported collection JSON from Firestore (admin export)
    async function fetchExportedCollection() {
        try {
            if (!(firebase && firebase.firestore)) return null;
            const col = firebase.firestore().collection('exports').doc('collections').collection('snapshots');
            const snap = await col.orderBy('createdAt', 'desc').limit(1).get();
            if (snap.empty) return null;
            const data = snap.docs[0].data();
            if (!data || !data.format) return null;
            if (data.format === 'json' && data.payload) {
                try {
                    const parsed = JSON.parse(data.payload);
                    if (Array.isArray(parsed)) return parsed;
                } catch (e) {
                    console.warn('Could not parse exported JSON payload:', e);
                    return null;
                }
            }
            return null;
        } catch (e) {
            console.warn('Error fetching exported collection:', e);
            return null;
        }
    }

    async function callAiFunction(promptText) {
        // Always use the single configured cloud function endpoint.
        const url = 'https://us-central1-boardgameapp-cc741.cloudfunctions.net/generateAiSummary';
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptText })
        });
        if (!resp.ok) throw new Error(`Cloud Function error: ${resp.status}`);
        const data = await resp.json().catch(async () => ({ summary: await resp.text() }));
        if (data && data.summary) return data.summary;
        if (typeof data === 'string') return data;
        return '';
    }

    async function handleQuery(q) {
        if (!q || !q.trim()) return;
        appendMessage('user', q);
        appendBotHtml('<div class="chatbot-result">Searching your collection…</div>');

        // Prefer admin-exported JSON snapshot if available, otherwise wait for client-side lists
        let games = await fetchExportedCollection();
        if (!games || !games.length) {
            games = await waitForGames(5000);
        }
        if (!games || games.length === 0) {
            appendBotHtml('<div class="chatbot-result">No game data found yet. Try loading the Collection view first or export the collection from Admin.</div>');
            return;
        }

        const parsed = parseQuery(q);
        const scored = scoreGames(parsed, games);
        const top = scored.filter(s=>s.score>0).slice(0,8);
        if (top.length === 0) {
            appendBotHtml('<div class="chatbot-result">I could not find a close match. Try different keywords like "2-4 players" or "<30 min".</div>');
            return;
        }

        // Gather summaries/snippets to include in prompt
        const ids = top.map(t=>t.game.bggId || t.game.id || t.game.bggid).filter(Boolean).slice(0,6);
        const sums = await fetchSummariesFor(ids);

        // Build a strict prompt in the same style as the translation flow
        const uiLang = localStorage.getItem('bgg_lang') || 'de';
        let prompt = `You are an enthusiastic board game recommendation assistant. Answer in simple text, no markdown. Keep the reply concise. Respond in ${uiLang === 'de' ? 'German' : 'English'}.\n\n`;
        prompt += `User input: "${q}"\n\n`;
        prompt += 'Collection candidates (name | players range | playtime minutes | short description):\n';
        top.slice(0,6).forEach(t => {
            const g = t.game;
            const id = g.bggId || g.id || g.bggid || '';
            const summary = (sums[id] && (sums[id].description_en || sums[id].description_de_auto || sums[id].description_de)) || g.description || '';
            const players = (g.minPlayers||'?') + '–' + (g.maxPlayers||'?');
            const time = g.playingTime || g.playtime || '';
            prompt += `- ${g.name} | ${players} | ${time} | ${summary.replace(/\s+/g,' ').slice(0,300)}\n`;
        });

        prompt += `\nINSTRUCTIONS: Based on the user input and the candidate list, produce a ranked list (maximum 4 items) of recommended games. For each recommendation include: game name, one short reason why it matches the query, suggested player count, and playtime. Feel free to be chatty about the games and be friendly. Analyse the candidate list to give the best fitting recommendation based on descriptions and stats`;

        // Ask the cloud function for an LLM-powered response, fallback to local if it fails
        appendBotHtml('<div class="chatbot-result">Asking the AI for recommendations…</div>');
        try {
            const llmReply = await callAiFunction(prompt);
            appendBotHtml(`<div class="chatbot-result">${escapeHtml(llmReply).replace(/\n/g,'<br/>')}</div>`);
        } catch (err) {
            // fallback: show the local matches we built earlier
            let html = '<div class="chatbot-result"><div style="font-weight:600;margin-bottom:6px;">Top matches (local)</div>';
            top.slice(0,6).forEach(t => {
                const g = t.game;
                const id = g.bggId || g.id || g.bggid;
                const summary = (sums[id] && (sums[id].description_en || sums[id].description_de_auto || sums[id].description_de)) || g.description || '';
                const meta = [];
                if (g.minPlayers || g.maxPlayers) meta.push(`${g.minPlayers || '?'}–${g.maxPlayers || '?'} players`);
                if (g.playingTime) meta.push(`${g.playingTime} min`);
                html += `<div style="margin-bottom:8px;">
                            <div class="title">${escapeHtml(g.name || g.title || 'Unknown')}</div>
                            <div class="meta">${escapeHtml(meta.join(' • '))}</div>
                            <div style="margin-top:6px; font-size:0.9rem; color:#374151;">${escapeHtml((summary||'').slice(0,220))}${(summary||'').length>220? '…':''}</div>
                            <div style="margin-top:6px;"><button class="btn btn-sm btn-outline-primary chatbot-open-game" data-bgg-id="${escapeHtml(id)}">Open</button></div>
                        </div>`;
            });
            html += '</div>';
            appendBotHtml(html);
        }

        // Wire open buttons
        messagesEl.querySelectorAll('.chatbot-open-game').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const bid = btn.dataset.bggId;
                const card = document.querySelector(`.game-card[data-bgg-id="${CSS.escape(bid)}"]`);
                if (card) { card.click(); }
                try { const modalEl = document.getElementById('game-details-modal'); if (modalEl) new bootstrap.Modal(modalEl).show(); } catch (e) {}
            });
        });
    }

    sendBtn.addEventListener('click', () => { handleQuery(inputEl.value); inputEl.value = ''; });
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });

    // Small welcome message
    appendBotHtml('<div class="chatbot-result">Hi! Tell me what you want — e.g. "2-4 players, <30 min, cooperative".</div>');

    // util: simple html escape
    function escapeHtml(s) { if (!s) return ''; return String(s).replace(/[&<>"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'\"'}[c]||c)); }
});
