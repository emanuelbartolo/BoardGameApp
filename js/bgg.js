// BGG API functions will go here

// Note: The BGG XML API2 does not support CORS.
// You will need to set up a proxy to fetch data from it in a web browser.
// A simple Firebase Cloud Function can serve as this proxy.

async function fetchBggCollection(username) {
    // Replace with your proxy URL
    const proxyUrl = 'YOUR_PROXY_URL_HERE'; 
    const url = `${proxyUrl}?username=${username}`;

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
        for (let i = 0; i < items.length; i++) {
            const name = items[i].getElementsByTagName('name')[0].textContent;
            const year = items[i].getElementsByTagName('yearpublished')[0]?.textContent;
            const image = items[i].getElementsByTagName('thumbnail')[0]?.textContent;
            const bggId = items[i].getAttribute('objectid');

            games.push({ name, year, image, bggId });
        }
        return games;
    } catch (error) {
        console.error("Failed to fetch BGG collection:", error);
        return [];
    }
}
