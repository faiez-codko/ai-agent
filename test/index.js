import SheetsService from '../src/tools/sheets.js';

(async () => {
  const svc = new SheetsService({ keyFile: "C:\\Users\\Faiez\\service-file.json" });
  const created = await svc.createSheet({title : "Auto Sheet" , shareWithEmails : ["demo@gmail.com"]});
  console.log(created);
})();