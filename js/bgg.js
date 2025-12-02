async function fetchBggCollection(username) {
    // Reliable free CORS proxy for BGG (tested with leli84)
    const proxyUrl = 'https://corsproxy.io/?';
    const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
    const url = proxyUrl + encodeURIComponent(bggUrl);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        if (xmlDoc.querySelector('parsererror')) {
            throw new Error('Invalid XML response');
        }
        
        const games = [];
        const items = xmlDoc.getElementsByTagName('item');
        for (let i = 0; i < Math.min(items.length, 30); i++) { // Limit to 30
            const nameNode = items[i].getElementsByTagName('name')[0];
            const name = nameNode ? nameNode.textContent : 'Unknown';
            const yearNode = items[i].getElementsByTagName('yearpublished')[0];
            const year = yearNode ? yearNode.textContent : '';
            const imageNode = items[i].getElementsByTagName('thumbnail')[0];
            const image = imageNode ? imageNode.textContent : '';
            const bggId = items[i].getAttribute('objectid') || '';

            if (name !== 'Unknown') {
                games.push({ name, year, image, bggId });
            }
        }
        return games;
    } catch (error) {
        console.error("Failed to fetch BGG collection:", error);
        return [];
    }
}

