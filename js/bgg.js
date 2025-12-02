// This file only contains the function to parse the BGG XML file content.
function parseBggXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    if (xmlDoc.querySelector('parsererror')) {
        throw new Error('Failed to parse XML. Please ensure the file is a valid BGG collection XML.');
    }

    const games = [];
    const items = xmlDoc.getElementsByTagName('item');
    for (let i = 0; i < items.length; i++) {
        const nameNode = items[i].getElementsByTagName('name')[0];
        const name = nameNode ? nameNode.textContent : 'Unknown';
        
        if (name === 'Unknown') continue; // Skip items without a name

        const yearNode = items[i].getElementsByTagName('yearpublished')[0];
        const year = yearNode ? yearNode.textContent : '';
        const imageNode = items[i].getElementsByTagName('thumbnail')[0];
        const image = imageNode ? imageNode.textContent : '';
        const bggId = items[i].getAttribute('objectid') || '';

        if (bggId) {
            games.push({ name, year, image, bggId });
        }
    }
    return games;
}

