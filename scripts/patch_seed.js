const fs = require('fs');
const path = require('path');

const seedFile = path.join(__dirname, '../frontend/src/modules/dri/driWorkbookSeed.generated.ts');
const updateFile = path.join(__dirname, 'catalog_update.json');

const updateData = JSON.parse(fs.readFileSync(updateFile, 'utf8'));

// Extract the JS object from the TS file
let seedContent = fs.readFileSync(seedFile, 'utf8');

// The file looks like: export const DRI_WORKBOOK_SEED = { ... } as const;
const jsonString = seedContent.replace('export const DRI_WORKBOOK_SEED = ', '').replace(/as const\s*;\s*$/, '').replace(/;\s*$/, '');
const seed = JSON.parse(jsonString);

let updatedCount = 0;
let newCount = 0;

updateData.forEach(item => {
    // Only process IFUs with params
    if (item.docType !== 'IFU' || !Object.keys(item.params).length) return;
    
    // Attempt to match by code or name
    // BioSystems articles: 12503 -> GLU
    // Let's create a map or try to find a match
    let match = seed.reagents.find(r => 
        (r.referenceCode && r.referenceCode.includes(item.code)) ||
        r.name.toLowerCase() === item.name.toLowerCase()
    );

    // Some names are "A-15-A-25 GLUCOSA", let's extract the actual name
    const cleanedItemName = item.name.replace(/A-15-A-25\s|BA-200-400\s/i, '').trim().toUpperCase();

    if (!match) {
        match = seed.reagents.find(r => 
            r.id.toUpperCase() === cleanedItemName ||
            r.name.toUpperCase() === cleanedItemName ||
            r.name.toUpperCase().includes(cleanedItemName) ||
            cleanedItemName.includes(r.name.toUpperCase())
        );
    }

    if (match) {
        // Update existing
        match.primaryWavelengthNm = item.params.primaryWavelengthNm || match.primaryWavelengthNm;
        match.referenceWavelengthNm = item.params.referenceWavelengthNm || match.referenceWavelengthNm;
        match.reportedMethod = item.params.reportedMethod || match.reportedMethod;
        match.reagentType = item.params.reagentType || match.reagentType;
        match.readMode = item.params.readMode || match.readMode;
        
        match.sourceStatus = "IFU Analizado (Automático)";
        match.confidence = item.confidence;
        match.sourceReference = `IFU: ${item.fileName}`;
        updatedCount++;
    } else {
        // Add new
        const newReagent = {
            id: cleanedItemName.replace(/[^A-Z0-9]/g, '_').substring(0, 10),
            rawId: item.code,
            name: cleanedItemName,
            calibrationMode: "Lineal", // default
            readMode: item.params.readMode || "Mono",
            primaryWavelengthNm: item.params.primaryWavelengthNm || null,
            referenceWavelengthNm: item.params.referenceWavelengthNm || null,
            reportedMethod: item.params.reportedMethod || "Desconocido",
            reagentType: item.params.reagentType || "Variable",
            operationalNote: "Añadido desde archivo PDF",
            preliminaryRisk: "Medio",
            sourceStatus: "IFU Analizado (Automático)",
            confidence: item.confidence,
            sourceType: item.sourceType,
            sourceReference: `IFU: ${item.fileName}`
        };
        seed.reagents.push(newReagent);
        newCount++;
    }
});

// Write back
const newTsContent = `export const DRI_WORKBOOK_SEED = ${JSON.stringify(seed, null, 2)} as const;\n`;
fs.writeFileSync(seedFile, newTsContent, 'utf8');

console.log(`Updated ${updatedCount} existing reagents.`);
console.log(`Added ${newCount} new reagents.`);
