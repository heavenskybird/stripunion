import { google } from 'googleapis';

export function googleCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON');
  }
}

export function googleAuth(scopes) {
  return new google.auth.GoogleAuth({
    credentials: googleCredentials(),
    scopes
  });
}
