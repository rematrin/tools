const lines = [
    "20A - Výrobní činnost – etapy a členění výroby, produkční funkce",
    "Výrobní činnost - základní proces přeměny vstupů...",
    "                               * teoretická (absolutní maximum",
    "za ideálních podmínek),",
    "                               * skutečná (reálně dosažený",
    "objem).               ",
    "Využití:",
    "                               * prodejní (kontrola kvality, balení, expedice a distribuce).",
    "Členění výroby",
    "                               * Podle objemu"
];

for(let i=0; i<lines.length; i++) {
    let rawLine = lines[i];
    let line = rawLine.trim();
    if(!line) continue;
    
    let isList = !!line.match(/^[\*\-•]\s+/);
    let mergedText = isList ? line.match(/^[\*\-•]\s+(.*)/)[1] : line;
    let lastRawLength = rawLine.trimEnd().length; 
    
    let j = i + 1;
    while(j < lines.length) {
        let nextRawLine = lines[j];
        let nextLine = nextRawLine.trim();
        if(!nextLine) break;
        if(nextLine.match(/^[\*\-•]\s+/)) break;
        
        let prevEndsPunct = !!mergedText.match(/[\.,;:!?'"”\)]$/);
        let nextStartsCap = !!nextLine.match(/^[A-ZА-ЯČŘŠŽÝÁÍÉÚŮŤĎŇ]/);
        
        if (lastRawLength < 60) break; // Google usually wraps > 60
        
        if (!prevEndsPunct && nextStartsCap) break; 
        
        // If it's a list item, and next line starts with a capital letter, it's likely a heading!
        if (isList && nextStartsCap && nextLine.length < 50 && !nextLine.match(/[\.,;]$/)) break;
        
        // If not a list item, but looks like a heading
        if (!isList && nextLine.length < 60 && !nextLine.match(/[\.,;]$/) && nextStartsCap) break;

        mergedText += ' ' + nextLine;
        lastRawLength = nextRawLine.trimEnd().length;
        j++;
    }
    i = j - 1;
    console.log("MERGED:", mergedText);
}
