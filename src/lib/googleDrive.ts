import { google } from 'googleapis';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;

const auth = new google.auth.OAuth2(CLIENT_ID, '', '');

export async function createGoogleDoc(data: any) {
  const driveService = google.drive({ version: 'v3', auth });
  driveService.context._options = { key: API_KEY };

  const fileMetadata = {
    name: data.title,
    mimeType: 'application/vnd.google-apps.document',
  };

  const media = {
    mimeType: 'text/plain',
    body: `Title: ${data.title}\nDescription: ${data.description}\nDue Date: ${data.dueDate}\nAssigned To: ${data.assignedTo.join(', ')}`,
  };

  const file = await driveService.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });

  return file.data.id;
}

export async function createGoogleSheet(data: any) {
  const driveService = google.drive({ version: 'v3', auth });
  driveService.context._options = { key: API_KEY };

  const fileMetadata = {
    name: data.title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
  };

  const file = await driveService.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  // Optionally, add data to the sheet
  const sheets = google.sheets({ version: 'v4', auth });
  sheets.context._options = { key: API_KEY };
  await sheets.spreadsheets.values.update({
    spreadsheetId: file.data.id,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Title', 'Description', 'Due Date', 'Assigned To'],
        [data.title, data.description, data.dueDate, data.assignedTo.join(', ')],
      ],
    },
  });

  return file.data.id;
}

export async function uploadFileToGoogleDrive(file: File) {
  const driveService = google.drive({ version: 'v3', auth });
  driveService.context._options = { key: API_KEY };

  const fileMetadata = {
    name: file.name,
    mimeType: file.type,
  };

  const media = {
    mimeType: file.type,
    body: file,
  };

  const response = await driveService.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });

  return response.data.id;
}

export async function getAuthClient() {
  const authClient = new google.auth.OAuth2(CLIENT_ID, '', '');
  authClient.setCredentials({
    access_token: API_KEY,
  });
  return authClient;
}