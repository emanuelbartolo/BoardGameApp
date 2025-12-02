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

        const bggId = items[i].getAttribute('objectid') || '';
        if (!bggId) continue;

        const yearNode = items[i].getElementsByTagName('yearpublished')[0];
        const imageNode = items[i].getElementsByTagName('thumbnail')[0];
        
        const statsNode = items[i].getElementsByTagName('stats')[0];
        const ratingNode = statsNode ? statsNode.querySelector('rating average') : null;

        games.push({
            name: name,
            bggId: bggId,
            year: yearNode ? yearNode.textContent : '',
            image: imageNode ? imageNode.textContent : '',
            minPlayers: statsNode ? statsNode.getAttribute('minplayers') : 'N/A',
            maxPlayers: statsNode ? statsNode.getAttribute('maxplayers') : 'N/A',
            playingTime: statsNode ? statsNode.getAttribute('playingtime') : 'N/A',
            rating: ratingNode ? parseFloat(ratingNode.getAttribute('value')).toFixed(1) : 'N/A',
        });
    }
    return games;
}

