import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export default defineConfig({
 testDir:'./tests',fullyParallel:true,forbidOnly:!!process.env.CI,retries:0,workers:3,
 outputDir:join(tmpdir(),'astra-med-test-results'),reporter:'list',
 use:{headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}},
 projects:[
  {name:'homepage',testMatch:'homepage.spec.ts',use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1487,height:1058},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}}},
  {name:'desktop',testMatch:'dashboard.spec.ts',use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1536,height:1024}}},
  {name:'mobile',testMatch:'dashboard.spec.ts',use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:5173'}},
  {name:'api-mode',testMatch:'live-api.spec.ts',use:{baseURL:'http://127.0.0.1:5174',viewport:{width:1440,height:900}}},
 ],
 webServer:[
  {command:'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',url:'http://127.0.0.1:5173/dashboard.html',reuseExistingServer:!process.env.CI,env:{VITE_USE_MOCK:'true'}},
  {command:'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174/dashboard.html',reuseExistingServer:!process.env.CI,env:{VITE_USE_MOCK:'false',VITE_API_BASE_URL:'http://localhost:8000'}},
 ],
})
