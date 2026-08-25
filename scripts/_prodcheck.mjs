import { chromium } from "playwright";
const BASE="https://member.pickabook.lk";
const URL_=process.env.NEXT_PUBLIC_SUPABASE_URL, SVC=process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW="TempDeployCheck!2026", EMAIL="deploycheck@deploycheck.test";
const h={apikey:SVC,Authorization:`Bearer ${SVC}`,"Content-Type":"application/json"};
const api=(p,o={})=>fetch(`${URL_}${p}`,{...o,headers:{...h,...(o.headers||{})}});
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return t}};

// temp member
const {users=[]}=await j(await api("/auth/v1/admin/users?per_page=200"));
for(const u of users) if(u.email===EMAIL) await api(`/auth/v1/admin/users/${u.id}`,{method:"DELETE"});
const u=await j(await api("/auth/v1/admin/users",{method:"POST",body:JSON.stringify({email:EMAIL,password:PW,email_confirm:true})}));
const club=(await j(await api("/rest/v1/clubs?slug=eq.public-club&select=id")))[0];
await api(`/rest/v1/profiles?id=eq.${u.id}`,{method:"PATCH",body:JSON.stringify({status:"active",first_name:"Deploy",last_name:"Check"})});
await api("/rest/v1/club_memberships",{method:"POST",body:JSON.stringify({member_id:u.id,club_id:club.id,status:"active",is_primary:true,joined_on:"2026-08-25",renewal_date:"2027-08-25"})});

const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1280,height:1100}})).newPage();
const csp=[]; page.on("console",m=>{const t=m.text(); if(/Content Security Policy|Refused to/i.test(t)) csp.push(t);});

await page.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"});
await page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.disabled===false,{timeout:60000});
console.log("button enabled (hydrated) before we click");
await page.fill('input[name="email"]',EMAIL); await page.fill('input[name="password"]',PW);
await page.click('button[type="submit"]');
await page.waitForURL(u=>u.pathname==="/feed",{timeout:45000}).catch(()=>{});
console.log("logged in ->", page.url());

await page.goto(`${BASE}/books`,{waitUntil:"domcontentloaded"});
await page.waitForTimeout(4000);
const body=await page.innerText("body");
const count=(body.match(/([\d,]+) books/)||[])[1];
console.log("catalogue says:", count ? count+" books" : "(no count found)");
console.log("unavailable banner?", /temporarily unavailable|isn't connected/.test(body) ? "YES - PROBLEM" : "no");
const imgs=await page.$$eval("img",els=>els.filter(e=>e.currentSrc||e.src).length);
console.log("covers rendered:", imgs);
const prices=(body.match(/LKR [\d,]+/g)||[]).slice(0,4);
console.log("prices shown:", prices.join("  "));
console.log("member discount line:", /save LKR/.test(body) ? "present" : "MISSING");
await page.screenshot({path:"test-screenshots/prod-books.png",fullPage:false});

await page.goto(`${BASE}/library`,{waitUntil:"domcontentloaded"});
await page.waitForTimeout(3000);
const lib=await page.innerText("body");
console.log("library:", (lib.match(/([\d,]+) books? available to borrow/)||[])[0] || "(none)");

console.log("CSP violations:", csp.length);
await b.close();
for(const x of (await j(await api("/auth/v1/admin/users?per_page=200"))).users||[]) if(x.email===EMAIL) await api(`/auth/v1/admin/users/${x.id}`,{method:"DELETE"});
console.log("temp account removed");
