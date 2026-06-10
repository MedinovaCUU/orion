import os
import glob
import re
import json
import fitz  # PyMuPDF

DOWNLOADS_DIR = 'einfo_downloads'
OUTPUT_FILE = 'scripts/catalog_update.json'

def clean_text(text):
    return re.sub(r'\s+', ' ', text)

def extract_params(text):
    params = {}
    
    # Text normalization for regex
    normalized = clean_text(text).lower()
    
    # 1. Wavelengths
    wl_match = re.search(r'(?:longitud de onda|filtro principal)[^\d]*(\d{3})\b', normalized)
    if wl_match:
        params['primaryWavelengthNm'] = int(wl_match.group(1))
    else:
        # Fallback to typical wavelengths
        wl_fallback = re.findall(r'\b(340|405|505|535|560|600|635|670)\s*nm\b', normalized)
        if wl_fallback:
            params['primaryWavelengthNm'] = int(wl_fallback[0])

    ref_wl_match = re.search(r'(?:filtro de referencia|secundaria)[^\d]*(\d{3})\b', normalized)
    if ref_wl_match:
        params['referenceWavelengthNm'] = int(ref_wl_match.group(1))

    # 2. Reaction Method (Cinética, Punto final, Tiempo fijo, Diferencial)
    if 'cinética' in normalized or 'kinetic' in normalized:
        params['reportedMethod'] = 'Cinética'
    elif 'punto final' in normalized or 'end point' in normalized:
        params['reportedMethod'] = 'Punto final'
    elif 'tiempo fijo' in normalized or 'fixed time' in normalized:
        params['reportedMethod'] = 'Tiempo fijo'
    elif 'diferencial' in normalized or 'differential' in normalized:
        params['reportedMethod'] = 'Diferencial'

    # 3. Read Mode
    if 'bicromática' in normalized or 'bichromatic' in normalized or 'filtro de referencia' in normalized or params.get('referenceWavelengthNm'):
        params['readMode'] = 'Bicro'
    elif 'monocromática' in normalized or 'monochromatic' in normalized or 'monoreactiva' in normalized:
        params['readMode'] = 'Mono'
        
    # 4. Reagent Type (Mono or Bi)
    if 'monoreactiv' in normalized or 'reactivo único' in normalized or 'un solo reactivo' in normalized:
        params['reagentType'] = 'Monoreactiva'
        if not params.get('reportedMethod'):
             params['reportedMethod'] = 'Monoreactiva'
        else:
             params['reportedMethod'] += ' monoreactiva'
    elif 'bireactiv' in normalized or 'dos reactivos' in normalized or 'reactivo a y b' in normalized:
        params['reagentType'] = 'Bireactiva'
        if params.get('reportedMethod'):
             params['reportedMethod'] += ' bireactiva'

    return params

def main():
    if not os.path.exists(DOWNLOADS_DIR):
        print(f"Directory {DOWNLOADS_DIR} not found.")
        return

    results = []
    
    for filepath in sorted(glob.glob(f"{DOWNLOADS_DIR}/*.pdf")):
        filename = os.path.basename(filepath)
        
        # Example filename: 12503_A-15-A-25_GLUCOSA.pdf
        # Try to extract code and name
        m = re.match(r'^(\d+)_([^\.]+)\.pdf$', filename)
        if m:
            code = m.group(1)
            raw_name = m.group(2).replace('_', ' ')
        else:
            code = filename.split('_')[0]
            raw_name = filename
            
        print(f"Processing {filename}...")
        
        try:
            doc = fitz.open(filepath)
            # Read first 3 pages usually enough
            text = ""
            for i in range(min(3, len(doc))):
                text += doc[i].get_text()
            
            params = extract_params(text)
            
            # Identify if it's IFU, CoA or Value Sheet roughly
            doc_type = "IFU"
            if "Value Sheet" in filename or "Value" in text[:500]:
                doc_type = "Value Sheet"
            elif "Certificate of Analysis" in text[:500] or "CoA" in filename:
                doc_type = "CoA"
            
            results.append({
                "code": code,
                "fileName": filename,
                "name": raw_name,
                "docType": doc_type,
                "params": params,
                "confidence": "estimated_from_IFU",
                "sourceType": "manual"
            })
            
        except Exception as e:
            print(f"Error reading {filename}: {e}")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
        
    print(f"\nExtracted data saved to {OUTPUT_FILE}")
    print(f"Total processed: {len(results)}")

if __name__ == "__main__":
    main()
