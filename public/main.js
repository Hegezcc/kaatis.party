const mediaUrl = '/indeksi.csv'
const baseUrl = 'https://kaatis.party/'
const mediaCount = 100;
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif', 'avif'];
const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v', '3gp', 'ogv'];
const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'aiff'];

let mediaOpened = 0;
const debounceTime = 300;
const globalKeywords = {};
const globalUsernames = {};
const searchTrees = {
    keywordStart: {},
    keywordEnd: {},
    usernameStart: {},
    usernameEnd: {},
};

let creatingMedia = false;
let mediaElements = [];
let searchQuery = null;
let globalMediaElements = [];
let debounceTimeout = null;


const extractType = (path) => {
    // Get the extension
    let matches = path.match(/.+\.([a-zA-Z0-9]+)$/);
    if (matches === null || matches.length < 2) {
        return 'unknown';
    }

    const extension = matches[1].toLowerCase();

    if (imageExtensions.includes(extension)) {
        return 'image';
    } else if (videoExtensions.includes(extension)) {
        return 'video';
    } else if (audioExtensions.includes(extension)) {
        return 'audio';
    } else {
        return 'unknown';
    }
};

const alphanum = (s) => s.toLowerCase()
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .split('-')
    .filter((x) => x !== '')

const search = (query) => {
    if (query === '') {
        // Empty query, return all media
        return globalMediaElements;
    }

    // Normalize the query into parts
    const searchParts = alphanum(query.toLowerCase());
    const results = [];

    console.log('Searching for:', searchParts)


    // Search for each part from keywords and usernames lists from beginning of each item and end of each item
    searchParts.forEach((part) => {
        // Direct matches
        let currentResults = globalKeywords[part];
        if (currentResults !== undefined) {
            results.push(...currentResults);
            console.log('Direct keyword match:', part, currentResults)
        }

        currentResults = globalUsernames[part];
        if (currentResults !== undefined) {
            results.push(...currentResults);
            console.log('Direct username match:', part, currentResults)
        }

        // Search trees
        currentResults = searchTree(part, searchTrees.keywordStart, searchTrees.keywordEnd, globalKeywords);
        results.push(
            ...currentResults.reduce((ids, item) => [...ids, ...globalKeywords[item]], [])
        );

        console.log('Keyword tree search:', part, currentResults);

        currentResults = searchTree(part, searchTrees.usernameStart, searchTrees.usernameEnd, globalUsernames);
        results.push(
            ...currentResults.reduce((ids, item) => [...ids, ...globalUsernames[item]], [])
        );

        console.log('Username tree search:', part, currentResults);
    });

    return results
        .filter((item, index) => results.indexOf(item) === index)
        .map(index => globalMediaElements[index]);
}

const addToSearchTrees = (keyword, startTree, endTree) => {
    for (let i = 0; i < keyword.length; i++) {
        const letter = keyword[i];
        if (startTree[letter] === undefined) {
            startTree[letter] = {};
        }

        startTree = startTree[letter];
    }

    for (let i = keyword.length - 1; i >= 0; i--) {
        const letter = keyword[i];
        if (endTree[letter] === undefined) {
            endTree[letter] = {};
        }

        endTree = endTree[letter];
    }
}

const debounce = (func, wait) => {
    // Debounce function to prevent multiple calls in short time
    // Use like:
    // const debouncedFunction = debounce(function, 300);
    // debouncedFunction();
 
    return function() {
        const context = this;
        const args = arguments;

        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => func.apply(context, args), wait);
    }
}

const exhaustTree = (prefix, tree, targetMap, direction) => {
    // Recursive function to return all the keys of targetMap that match the tree with given prefix
    // For example, when prefix = "kaatis" and tree contains leafs for "kaatis", "kaatistest" "kaatisparty", all of those are returned as list
    // Direction is either "start" or "end" to determine which end to add to the prefix
    let currentTree = tree;
    const results = [];

    while (true) {
        if (targetMap.hasOwnProperty(prefix)) {
            results.push(prefix);
        }

        const length = Object.keys(tree).length;

        if (length === 1) {
            // Single leaf
            const letter = Object.keys(tree)[0];
            if (direction === 'start') {
                prefix = prefix + letter;
            } else {
                prefix = letter + prefix;
            }

            tree = tree[letter];
            continue;
        } else if (length === 0) {
            // End of tree
            break;
        } else {
            // Multiple leaves, recurse
            for (const letter in tree) {
                let leafPrefix;
                if (direction === 'start') {
                    leafPrefix = prefix + letter;
                } else {
                    leafPrefix = letter + prefix;
                }
                results.push(...exhaustTree(leafPrefix, tree[letter], targetMap, direction));
            }
            break;
        }
    }

    // Ensure result uniqueness
    return results.filter((item, index) => results.indexOf(item) === index);
}

const searchTree = (keyword, startTree, endTree, targetMap) => {
    // Results are the keys matched to targetMap
    const results = [];
    let currentTree = startTree;
    let i = 0;
    for (i = 0; i < keyword.length; i++) {
        const letter = keyword[i];
        if (currentTree[letter] === undefined) {
            break;
        } else {
            currentTree = currentTree[letter];
        }
    }

    if (i === keyword.length) {
        // Add all matching results from the tree to the results
        results.push(...exhaustTree(keyword, currentTree, targetMap, 'start'));
    }

    currentTree = endTree;
    for (i = keyword.length - 1; i >= 0; i--) {
        const letter = keyword[i];
        if (currentTree[letter] === undefined) {
            break;
        } else {
            currentTree = currentTree[letter];
        }
    }

    if (i === -1) {
        // Add all matching results from the tree to the results
        results.push(...exhaustTree(keyword, currentTree, targetMap, 'end'));
    }

    return results;
}


// Function code from here: https://stackoverflow.com/a/14991797 with CC BY-SA 4.0 license
function parseCSV(str) {
    const arr = [];
    let quote = false;  // 'true' means we're inside a quoted field

    // Iterate over each character, keep track of current row and column (of the returned array)
    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];        // Current character, next character
        arr[row] = arr[row] || [];             // Create a new row if necessary
        arr[row][col] = arr[row][col] || '';   // Create a new column (start with empty string) if necessary

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }

        // If it's just one quotation mark, begin/end quoted field
        if (cc == '"') { quote = !quote; continue; }

        // If it's a comma and we're not in a quoted field, move on to the next column
        if (cc == ',' && !quote) { ++col; continue; }

        // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
        // and move on to the next row and move to column 0 of that new row
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }

        // If it's a newline (LF or CR) and we're not in a quoted field,
        // move on to the next row and move to column 0 of that new row
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }

        // Otherwise, append the current character to the current column
        arr[row][col] += cc;
    }
    return arr;
}

const readableFilename = (filename) => {
    // Remove extension and use 
    let matches = filename.match(/(.+)\.[a-zA-Z0-9]+$/);
    if (matches === null || matches.length < 2) {
        // Match without extension
        matches = filename.match(/(.+)$/);
    }

    let keywords = matches[1].match(/([a-zA-Z0-9]+)/g);
    let name;
    if (keywords === null) {
        keywords = [];
        name = matches[1];
    } else {
        name = keywords.join(' ');
    }

    keywords = keywords
        .map(keyword => keyword.toLowerCase())
        .filter((keyword, index) => keyword.length > 1 && keywords.indexOf(keyword) === index);

    return {name, keywords};
}

const getMedia = async () => {
    // Fetch the Apache directory listing and parse it to media object
    const response = await fetch(mediaUrl).then(res => res.text());

    // Parse the CSV file
    const csv = parseCSV(response).reverse();

    // console.log(csv)

    csv.forEach((row) => {
        // CSV rows: path, username, date
        let [path, creator, modified] = row;

        // console.log({path, creator, modified})

        const type = extractType(path);
        const {name, keywords} = readableFilename(path);
        const url = `${baseUrl}${path}`;

        globalMediaElements.push({
            type,
            name,
            keywords,
            url,
            modified,
            creator,
        });
    });

    globalMediaElements.sort((a, b) => new Date(b.modified) - new Date(a.modified))

    globalMediaElements.forEach((media, index) => {
        // Add each keyword to the global keywords list
        media.keywords.forEach(keyword => {
            if (globalKeywords[keyword] === undefined) {
                globalKeywords[keyword] = [];

                addToSearchTrees(keyword, searchTrees.keywordStart, searchTrees.keywordEnd);
            }

            globalKeywords[keyword].push(index);
        });

        // Add username to global list
        alphanum(media.creator).forEach(part => {
            if (globalUsernames[part] === undefined) {
                globalUsernames[part] = [];

                addToSearchTrees(part, searchTrees.usernameStart, searchTrees.usernameEnd);
            }

            globalUsernames[part].push(index);
        });
    })
}

const closeMedia = () => {
    if (Date.now() - mediaOpened < 100) {
        // Prevent accidental closing
        return;
    }

    console.log('Closing media')
    document.getElementById('open-card').classList.add('closed');

    document.querySelector('#open-card .media').innerHTML = '';

    mediaOpened = Date.now()
}

const openMedia = (media) => {
    if (Date.now() - mediaOpened < 100) {
        // Prevent accidental opens
        return;
    }

    // Open media in a fixed area in full size card
    console.log('Opening media', media)

    const card = document.getElementById('open-card');
    const mediaRoot = card.querySelector('.media');
    mediaRoot.innerHTML = '';
    getMediaElement(media, true).forEach(element => mediaRoot.appendChild(element));

    card.querySelector('.title').innerText = media.name;
    card.querySelector('.creator').innerText = media.creator;
    card.querySelector('.modified').innerText = media.modified;
    card.querySelector('.url').href = media.url;
    
    card.querySelector('.close').addEventListener('click', closeMedia);

    card.classList.remove('closed');

    mediaOpened = Date.now();
}



const getMediaElement = (item, playable) => {
    let elements = [];
    if (item.type === 'image') {
        const mediaImage = document.createElement('img');
        mediaImage.src = item.url;
        mediaImage.alt = item.name;
        mediaImage.setAttribute('loading', 'lazy');
        elements.push(mediaImage);
    } else if (item.type === 'video') {
        const mediaVideo = document.createElement('video');
        mediaVideo.src = item.url;
        mediaVideo.controls = playable;
        mediaVideo.autoplay = playable;
        mediaVideo.setAttribute('loading', 'lazy');
        elements.push(mediaVideo);
    } else if (item.type === 'audio') {
        // Also add title text
        const mediaPre = document.createElement('p');
        mediaPre.textContent = 'Audio:';
        mediaPre.classList.add('media-audio-pre');
        elements.push(mediaPre);

        const mediaTitle = document.createElement('p');
        mediaTitle.textContent = item.name;
        mediaTitle.classList.add('media-audio-title');
        elements.push(mediaTitle);


        if (playable) {
            // Main element, only add if video is playable
            const mediaAudio = document.createElement('audio');
            mediaAudio.src = item.url;
            mediaAudio.controls = true;
            mediaAudio.autoplay = true;
            mediaAudio.setAttribute('loading', 'lazy');
            mediaAudio.classList.add('media-audio');
            elements.push(mediaAudio);
        }
    } else {
        console.warn('Unknown type', item.type, item)
        const mediaTitle = document.createElement('p');
        mediaTitle.textContent = `Unknown: item.name`;
        // elements.push(mediaTitle);
    }

    return elements;
}

const getDescriptionElement = (item) => {
    const description = document.createElement('div');
    description.classList.add('media-description');

    const title = document.createElement('h2');
    title.innerText = item.name;
    description.appendChild(title);

    const creator = document.createElement('p');
    creator.innerText = item.creator;
    description.appendChild(creator);

    return description;
}

const useMedia = (medias, query) => {
    if (searchQuery === query) {
        // Already displaying the same query
        return;
    }

    createMediaElements(medias.slice(0, mediaCount));
    mediaElements = medias.slice(mediaCount);
    searchQuery = query;
}

const createMediaElements = (media) => {
    if (creatingMedia) return;
    creatingMedia = true;

    console.log(media)
    const mediaContainer = document.getElementById('media-elements');
    media.forEach((item) => {
        const mediaElement = document.createElement('div');
        mediaElement.classList.add('media-item');
        mediaElement.addEventListener('click', () => openMedia(item));

        const medias = getMediaElement(item, false);
        if (medias.length > 0) {
            medias.forEach(element => mediaElement.appendChild(element));
            mediaContainer.appendChild(mediaElement);
        }

        const description = getDescriptionElement(item);
        mediaElement.appendChild(description);
    });

    creatingMedia = false;
}

const isOnScreen = (element) => {
    const rect = element.getBoundingClientRect();
    const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
}

// Attach scroll event to load more media if footer is seen
window.addEventListener('scroll', () => {
    if (isOnScreen(document.getElementById('footer'))) {
        // Load more media
        if (mediaElements.length > 0 && !creatingMedia) {
            createMediaElements(mediaElements.slice(0, mediaCount));
            mediaElements = mediaElements.slice(mediaCount);
        }
    }
});

document.querySelector('#open-card').addEventListener('click', (event) => {
    // Check that the click is not on the open card
    if (event.target.closest('.card-content') === null && document.getElementById('open-card').classList.contains('closed') === false) {
        closeMedia();
    }
});

document.getElementById('search').addEventListener('input', debounce((event) => {
    const query = event.target.value;
    console.log('Search:', query);
    const results = search(query);
    document.getElementById('media-elements').innerHTML = '';
    useMedia(results, query);
}, debounceTime));

getMedia().then(() => {
    document.getElementById('loading').remove();
    document.getElementById('media-elements').classList.remove('loading');
    useMedia(globalMediaElements, '');
}).catch((error) => {
    console.error('Error fetching media:', error);
    document.getElementById('loading').innerText = 'Not workingz :(';
});
