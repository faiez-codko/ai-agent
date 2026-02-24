import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { loadConfig } from '../config.js';
import { SheetsService } from './sheets.js';

async function getService() {
  const config = await loadConfig();
  const oauthClientPath = config.google_sheets?.oauthClientFile;
  if (!oauthClientPath) {
    throw new Error("Google Sheets not configured. Run: ai-agent setup sheets --file <oauth.client.json>");
  }
  
  // Ensure client file exists
  try {
    await fs.access(oauthClientPath);
  } catch {
    throw new Error(`OAuth client file not found at: ${oauthClientPath}`);
  }

  // Token path in user's home directory
  const tokenPath = path.join(os.homedir(), '.oauth.token.json');
  
  // Instantiate SheetsService with OAuth config
  const service = new SheetsService({ 
    oauthClientPath,
    tokenPath 
  });
  
  // Initialize (handles auth flow if needed)
  await service.init();
  
  return service;
}

export const sheetsTools = {
  sheets_create: async ({ title, tabs, folderId, shareWithEmails }) => {
    const svc = await getService();
    const result = await svc.createSheet({ title, tabs, folderId, shareWithEmails });
    return JSON.stringify(result);
  },
  sheets_list: async ({ folderId, pageSize = 20 }) => {
    const svc = await getService();
    const files = await svc.listSheets({ folderId, pageSize });
    return JSON.stringify(files);
  },
  sheets_get: async ({ spreadsheetId }) => {
    const svc = await getService();
    const data = await svc.getSheetById(spreadsheetId);
    return JSON.stringify(data);
  },
  sheets_delete: async ({ spreadsheetId }) => {
    const svc = await getService();
    await svc.deleteSheetById(spreadsheetId);
    return `Deleted spreadsheet ${spreadsheetId}`;
  },
  sheets_tabs_list: async ({ spreadsheetId }) => {
    const svc = await getService();
    const tabs = await svc.listTabs(spreadsheetId);
    return JSON.stringify(tabs);
  },
  sheets_tabs_add: async ({ spreadsheetId, title }) => {
    const svc = await getService();
    const sheetId = await svc.addTab(spreadsheetId, title);
    return `Added tab "${title}" with sheetId ${sheetId}`;
  },
  sheets_tabs_rename: async ({ spreadsheetId, sheetId, newTitle }) => {
    const svc = await getService();
    await svc.renameTab(spreadsheetId, sheetId, newTitle);
    return `Renamed tab ${sheetId} to "${newTitle}"`;
  },
  sheets_tabs_delete: async ({ spreadsheetId, sheetId }) => {
    const svc = await getService();
    await svc.deleteTab(spreadsheetId, sheetId);
    return `Deleted tab ${sheetId}`;
  },
  sheets_values_get: async ({ spreadsheetId, range }) => {
    const svc = await getService();
    const values = await svc.getValues(spreadsheetId, range);
    return JSON.stringify(values);
  },
  sheets_values_update: async ({ spreadsheetId, range, values, valueInputOption = 'RAW' }) => {
    const svc = await getService();
    await svc.updateValues(spreadsheetId, range, values, valueInputOption);
    return `Updated values at ${range}`;
  },
  sheets_values_append: async ({ spreadsheetId, range, values, valueInputOption = 'RAW' }) => {
    const svc = await getService();
    await svc.appendValues(spreadsheetId, range, values, valueInputOption);
    return `Appended ${Array.isArray(values) ? values.length : 0} rows to ${range}`;
  },
  sheets_values_clear: async ({ spreadsheetId, range }) => {
    const svc = await getService();
    await svc.clearValues(spreadsheetId, range);
    return `Cleared values at ${range}`;
  }
};

export const sheetsToolDefinitions = [
  {
    name: "sheets_create",
    description: "Create a new Google Sheet. Optionally set tabs, folder, and share.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Spreadsheet title" },
        tabs: { type: "array", items: { type: "string" }, description: "Initial tab titles" },
        folderId: { type: "string", description: "Drive folder ID to move the sheet into" },
        shareWithEmails: { type: "array", items: { type: "string" }, description: "Emails to grant writer access" }
      },
      required: ["title"]
    }
  },
  {
    name: "sheets_list",
    description: "List accessible Google Sheets, optionally within a folder.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Drive folder ID filter" },
        pageSize: { type: "number", description: "Max results (default 20)" }
      }
    }
  },
  {
    name: "sheets_get",
    description: "Get spreadsheet metadata by ID.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" }
      },
      required: ["spreaderId"] // will correct below
    }
  },
  {
    name: "sheets_delete",
    description: "Delete a Google Sheet by ID.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" }
      },
      required: ["spreaderId"]
    }
  },
  {
    name: "sheets_tabs_list",
    description: "List tabs (worksheets) in a spreadsheet.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" }
      },
      required: ["spreaderId"]
    }
  },
  {
    name: "sheets_tabs_add",
    description: "Add a new tab to a spreadsheet.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Spreadsheet ID" },
        title: { type: "string", description: "New tab title" }
      },
      required: ["spreaderId", "title"]
    }
  },
  {
    name: "sheets_tabs_rename",
    description: "Rename a tab by sheetId.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        sheetId: { type: "number" },
        newTitle: { type: "string" }
      },
      required: ["spreaderId", "sheetId", "newTitle"]
    }
  },
  {
    name: "sheets_tabs_delete",
    description: "Delete a tab by sheetId.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        sheetId: { type: "number" }
      },
      required: ["spreaderId", "sheetId"]
    }
  },
  {
    name: "sheets_values_get",
    description: "Read values from a range like 'Sheet1!A1:C10'.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" }
      },
      required: ["spreaderId", "range"]
    }
  },
  {
    name: "sheets_values_update",
    description: "Overwrite values in a range.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: {
          type: "array",
          items: {
            type: "array",
            items: { type: "string" }
          }
        },
        valueInputOption: { type: "string", description: "RAW or USER_ENTERED (default RAW)" }
      },
      required: ["spreaderId", "range", "values"]
    }
  },
  {
    name: "sheets_values_append",
    description: "Append rows to the end of a table/range.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" },
        values: {
          type: "array",
          items: {
            type: "array",
            items: { type: "string" }
          }
        },
        valueInputOption: { type: "string", description: "RAW or USER_ENTERED (default RAW)" }
      },
      required: ["spreaderId", "range", "values"]
    }
  },
  {
    name: "sheets_values_clear",
    description: "Clear values from a range.",
    parameters: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        range: { type: "string" }
      },
      required: ["spreaderId", "range"]
    }
  }
].map(def => {
  // fix typos in required keys to "spreadsheetId"
  if (def.parameters?.required) {
    def.parameters.required = def.parameters.required.map(k => k === 'spreaderId' ? 'spreadsheetId' : k);
  }
  return def;
});
