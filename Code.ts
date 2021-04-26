function myFunction() {
  console.log('hello world!');
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Twitter').addItem('Refresh Twitter Formulas', 'refresh').addToUi();
}

export const refresh = () => SpreadsheetApp.getUi().alert('Refreshed!');

export function fetchTweetResponses(tweetId: string) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast(`Fetching all tweet responses from tweet ${tweetId}`);

  return true;
}
