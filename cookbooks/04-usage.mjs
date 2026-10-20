import {createTestClient,TaghvimApiError} from "../sdk/javascript/index.js";
const client=createTestClient({apiKey:process.env.TAGHVIM_TEST_API_KEY});
try { const {data,requestId,rateLimit}=await client.usage();console.log({data,requestId,rateLimit}); }
catch(e){ if(e instanceof TaghvimApiError)console.error({status:e.status,code:e.code,requestId:e.requestId,retryAfter:e.retryAfter});else throw e; }
