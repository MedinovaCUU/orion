const fs = require('fs');
const content = fs.readFileSync('/Users/ricardomontanezmiranda/Desktop/Biosystems Project/frontend/src/components/Services.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
    if (l.includes('.toUpperCase()') || l.includes('.split(') || l.includes('.replace(')) {
        console.log(`Line ${i+1}: ${l.trim()}`);
    }
});
