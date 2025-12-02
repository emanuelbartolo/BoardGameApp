async function fetchBggCollection(username) {
    // ThingProxy: a reliable free CORS proxy. It fetches the raw URL.
    const proxyUrl = 'https://thingproxy.freeboard.io/fetch/';
    const bggUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1`;
    const url = proxyUrl + bggUrl;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Proxy HTTP error! status: ${response.status}`);
        }

        // The proxy returns raw XML, so we get it as text.
        const xmlText = await response.text();

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Check for BGG's "please wait" message or other invalid XML
        if (xmlDoc.querySelector('parsererror') || !xmlText.trim().startsWith('<')) {
            if (xmlText.includes("Your request for this collection is being processed")) {
                 throw new Error('BGG is processing the collection. Please try again in a moment.');
            }
            throw new Error('Invalid XML response from BGG or proxy.');
        }
        
        const games = [];
        const items = xmlDoc.getElementsByTagName('item');
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
        return games;
    } catch (error) {
        console.error("Failed to fetch BGG collection:", error);
        throw error; // Re-throw the error to be caught by the caller in app.js
    }
}

