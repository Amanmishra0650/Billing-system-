import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', fullyParallel:false, workers:1, timeout:30000,
  use:{baseURL:'http://127.0.0.1:32189',channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true,trace:'retain-on-failure'},
});
