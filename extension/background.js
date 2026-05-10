// Service worker — kept minimal since API calls happen in content script
chrome.runtime.onInstalled.addListener(() => {
  console.log('CollegeAdvice Rater installed.');
});
