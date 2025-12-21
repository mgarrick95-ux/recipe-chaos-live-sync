export async function POST() { return new Response(JSON.stringify({ title:'Imported Recipe', ingredients:[], steps:[] }), { headers:{'Content-Type':'application/json'} }); }
