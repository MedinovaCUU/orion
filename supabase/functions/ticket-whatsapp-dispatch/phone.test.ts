import {autoPhone} from './phone.ts';
Deno.test('phone destinations: country from equipment, prefixes, formatting, invalid and missing countries',()=>{
 const cases=[
 ['6141772897','México','526141772897'],
 ['(614) 177-2897','MEXICO','526141772897'],
 ['526141772897','Mexico','526141772897'],
 ['+52 6141772897','MX','526141772897'],
 ['5216141772897','MX','526141772897'],
 ['+52 1 6141772897','MX','526141772897'],
 ['00526141772897','MX','526141772897'],
 ['2025550123','Estados Unidos','12025550123'],
 ['612345678','España','34612345678'],
 ['3001234567','Colombia','573001234567'],
 ['020 7946 0018','Reino Unido','442079460018'],
 ['+1 2025550123','MEXICO','12025550123'],
 ['+526141772897','','526141772897'],
 ];
 for(const[input,country,want]of cases){const got=autoPhone(input,country);if(got!==want)throw new Error(`${input} / ${country}: ${got} != ${want}`);}
 for(const[input,country]of [['6141772897',''],['6141772897','Atlantis'],['123','MX'],['6141772897 ext 3','MX'],['','MX'],['+999123456789','MX']]){let rejected=false;try{autoPhone(input,country);}catch{rejected=true;}if(!rejected)throw new Error('Should reject '+input);}
});
