import { OAuth2Client } from 'google-auth-library';

export interface GoogleTokenPayload {
  email: string;
  sub: string;
  picture?: string;
  name?: string;
}

function getGoogleClient(): OAuth2Client {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
}

export async function verifyGoogleToken(googleToken: string): Promise<GoogleTokenPayload> {
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) throw new Error('No payload in Google token');
    if (!payload.email || !payload.sub) throw new Error('Missing email or sub in Google token');
    return {
      email: payload.email,
      sub: payload.sub,
      picture: payload.picture,
      name: payload.name,
    };
  } catch (err) {
    throw new Error(`Invalid Google token: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
