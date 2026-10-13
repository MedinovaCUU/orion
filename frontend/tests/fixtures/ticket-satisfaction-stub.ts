// Installed before the components load: the public survey client captures fetch when it is created.
const original=window.fetch.bind(window);let submitted=false;
window.fetch=async(input,init)=>{const url=String(input);if(url.includes('/rpc/get_ticket_satisfaction'))return new Response(JSON.stringify({case_number:'DEMO-001',specialist_name:'Especialista de demostración',answered:submitted}),{headers:{'Content-Type':'application/json'}});if(url.includes('/rpc/submit_ticket_satisfaction')){submitted=true;(window as unknown as {lastSurvey:unknown}).lastSurvey=JSON.parse(String(init?.body||'{}'));return new Response('null',{headers:{'Content-Type':'application/json'}});}return original(input,init);};
export {};
