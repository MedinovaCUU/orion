import {getCountries, parsePhoneNumberFromString, type CountryCode} from 'npm:libphonenumber-js@1.13.14/max';

const key = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z]/g,'').toUpperCase();
const countries = new Map<string,CountryCode>();
for (const locale of ['es','en']) {
 const labels = new Intl.DisplayNames([locale],{type:'region'});
 for (const code of getCountries()) {
  countries.set(code,code);
  countries.set(key(labels.of(code)||code),code);
 }
}
for (const [alias,code] of Object.entries({MEX:'MX',USA:'US',EEUU:'US',UK:'GB',ESP:'ES',COL:'CO',ARG:'AR',BRA:'BR',PER:'PE',CHL:'CL'})) countries.set(alias,code as CountryCode);

export function autoPhone(value:unknown, equipmentCountry?:string|null):string {
 if(typeof value!=='string'||!/^\+?[\d\s().-]+$/.test(value.trim())) throw new Error('Revisa el teléfono de contacto: usa solo el número, sin extensiones.');
 let input=value.trim().replace(/[\s().-]/g,'');
 if(input.startsWith('00')) input='+'+input.slice(2);
 const country=equipmentCountry?countries.get(key(equipmentCountry)):undefined;
 // Preserve explicit international destinations; support the old Mexican mobile prefix.
 if(/^\+521\d{10}$/.test(input)) input='+52'+input.slice(4);
 if(!input.startsWith('+')) {
  if(!country) throw new Error('El equipo no tiene un país reconocido. Corrige su país o escribe el teléfono con + y código de país.');
  if(country==='MX'&&/^521\d{10}$/.test(input)) input='52'+input.slice(3);
 }
 const phone=parsePhoneNumberFromString(input,{defaultCountry:country,extract:false});
 if(!phone?.isValid()) throw new Error('El teléfono no es válido para el país del equipo. Revisa el número o incluye + y su código de país.');
 return phone.number.slice(1);
}
