# Mexico administrative geography

Source: INEGI, Servicio Web del Catalogo Unico de Claves Geoestadisticas.

- States: `https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/`
- Municipalities: `https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/{state_code}`
- Retrieved: 2026-07-13
- State simplification: 1.5 km
- Municipality simplification: 250 m
- Output: TopoJSON with quantization 100000

These generated files preserve geographic coordinates while reducing transfer and rendering cost. Municipality files are split by INEGI state code and loaded only when a location is focused.
