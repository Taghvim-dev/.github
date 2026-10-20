import {createTestClient} from "../sdk/javascript/index.js";
const client=createTestClient({apiKey:process.env.TAGHVIM_TEST_API_KEY});
const {data,requestId}=await client.schedulePreview({rule:"last-business",from:"1405-07-01",count:6});
console.log({data,requestId});
