import SheetsService from '../src/tools/sheets.js';

// (async () => {
//   const svc = new SheetsService({ keyFile: "C:\\Users\\Faiez\\service-file.json" });
//   const created = await svc.createSheet({title : "Auto Sheet" , shareWithEmails : ["demo@gmail.com"]});
//   console.log(created);
// })();

const sheets = new SheetsService({
  oauthClientPath: "./oauth.client.json",
  tokenPath: "./oauth.token.json",
});

const { spreadsheetId, spreadsheetUrl } = await sheets.createSheet({
  title: "b2b-leads-24-02-2026",
  tabs: ["Sheet1"],
});
console.log(spreadsheetId, spreadsheetUrl);