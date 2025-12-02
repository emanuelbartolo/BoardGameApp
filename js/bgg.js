async function fetchBggCollection(username) {
    // Free public CORS proxy for BGG XML API (no Firebase needed)
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
    const url = proxyUrl + encodeURIComponent(bggUrl);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const games = [];
        const items = xmlDoc.getElementsByTagName('item');
        for (let i = 0; i < Math.min(items.length, 50); i++) { // Limit to 50 for performance
            const nameNode = items[i].getElementsByTagName('name')[0];
            const name = nameNode ? nameNode.textContent : 'Unknown';
            const yearNode = items[i].getElementsByTagName('yearpublished')[0];
            const year = yearNode ? yearNode.textContent : '';
            const imageNode = items[i].getElementsByTagName('thumbnail')[0];
            const image = imageNode ? imageNode.textContent : '';
            const bggId = items[i].getAttribute('objectid') || '';

            games.push({ name, year, image, bggId });
        }
        return games;
    } catch (error) {
        console.error("Failed to fetch BGG collection:", error);
        return [];
    }
}

