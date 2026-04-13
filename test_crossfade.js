const fs = require('fs');
const html = fs.readFileSync('crossfade.html', 'utf8');

// Quick and dirty testing of the extract logic
function extractVideoId(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

function extractListId(url) {
    let reg = /[?&]list=([^#\&\?]+)/;
    let match = url.match(reg);
    return (match && match[1]) ? match[1] : null;
}

console.log("Check url string:", "https://www.youtube.com/watch?v=To7wHvDFu2M&list=PLgULlLHTSGISMiG9fB3jIEOabgXOZNAB6&index=2");
console.log("Video ID:", extractVideoId("https://www.youtube.com/watch?v=To7wHvDFu2M&list=PLgULlLHTSGISMiG9fB3jIEOabgXOZNAB6&index=2"));
console.log("List ID:", extractListId("https://www.youtube.com/watch?v=To7wHvDFu2M&list=PLgULlLHTSGISMiG9fB3jIEOabgXOZNAB6&index=2"));

