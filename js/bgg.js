async function fetchBggCollection(username) {
    // AllOrigins free CORS proxy - returns JSON with XML in 'contents'
    const proxyUrl = 'https://api.allorigins.win/get?url=';
    const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
    const url = proxyUrl + encodeURIComponent(bggUrl);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for BGG

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Proxy HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const xmlText = data.contents;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        if (xmlDoc.querySelector('parsererror')) {
            throw new Error('Invalid XML - no collection found or BGG error');
        }
        
        const games = [];
        const items = xmlDoc.getElementsByTagName('item');
        console.log(`Found ${items.length} items for ${username}`);
        for (let i = 0; i < Math.min(items.length, 30); i++) {
            const nameNode = items[i].getElementsByTagName('name')[0];
            const name = nameNode ? nameNode.textContent : 'Unknown';
            const yearNode = items[i].getElementsByTagName('yearpublished')[0];
            const year = yearNode ? yearNode.textContent : '';
            const imageNode = items[i].getElementsByTagName('thumbnail')[0];
            const image = imageNode ? imageNode.textContent : '';
            const bggId = items[i].getAttribute('objectid') || '';

            if (name !== 'Unknown' && bggId) {
                games.push({ name, year, image, bggId });
            }
        }
        console.log(`Parsed ${games.length} games`);
        return games;
    } catch (error) {
        console.error("Failed to fetch BGG collection:", error);
        return [];
    }
}

