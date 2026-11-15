export type AccountProfile = {
  id: string;
  email: string;
};

export type AccountPlatform = {
  readAccountSession(): Promise<string | null>;
  writeAccountSession(value: string | null): Promise<void>;
  sendAccountRequest(
    path: string,
    method: 'GET' | 'POST',
    body: string | null,
    token: string | null,
  ): Promise<{ status: number; body: string }>;
};

type Session = {
  profile: AccountProfile;
  token: string;
  expiry: number;
};

type Endpoint = 'register' | 'login' | 'logout' | 'me';

// Swift's JSONEncoder stored Date values as seconds since January 1, 2001.
// Keep reading and writing that format so existing Keychain sessions still work.
const swiftDateEpoch = 978307200;
const unexpectedResponse = 'The account server returned an unexpected response.';

class AccountHTTPError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(responseMessage(status, body));
  }
}

function jsonObject(body: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body);
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value as Record<string, unknown>;
    }
  } catch {
    // An empty or non-JSON response has no fields to read.
  }
  return {};
}

function responseMessage(status: number, body: string) {
  switch (status) {
    case 400: {
      const fields = jsonObject(body);
      for (const name of ['email', 'password', 'non_field_errors']) {
        const messages = fields[name];
        if (Array.isArray(messages)) {
          const message = messages.filter(value => typeof value === 'string').join(' ');
          if (message) {
            return message;
          }
        }
      }
      return 'Check your email and password and try again.';
    }
    case 401:
      return 'Your email or password is incorrect, or your session has expired.';
    case 429:
      return 'Too many attempts. Wait a moment and try again.';
    default:
      return 'The account server could not complete the request.';
  }
}

function readProfile(value: unknown): AccountProfile | undefined {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return undefined;
  }
  const {id, email} = value as Record<string, unknown>;
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (
    typeof id !== 'string' ||
    !uuid.test(id) ||
    typeof email !== 'string'
  ) {
    return undefined;
  }
  return {id: id.toLowerCase(), email};
}

function isUnauthorized(error: unknown) {
  return (
    error instanceof AccountHTTPError &&
    error.status === 401
  );
}

function isUnavailable(error: unknown) {
  if (error instanceof AccountHTTPError) {
    return error.status >= 500;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'account-network'
  );
}

function sessionExpired(expiry: number) {
  return (
    !Number.isFinite(expiry) ||
    expiry <= Date.now() / 1000 - swiftDateEpoch
  );
}

export class AccountClient {
  constructor(private readonly platform: AccountPlatform) {}

  async status(): Promise<AccountProfile | null> {
    const session = await this.readSession();
    if (!session) {
      return null;
    }

    try {
      return await this.fetchProfile(session.token);
    } catch (error) {
      if (isUnauthorized(error)) {
        await this.platform.writeAccountSession(null);
        return null;
      }
      if (isUnavailable(error)) {
        return session.profile;
      }
      throw error;
    }
  }

  async authenticate(email: string, password: string, register: boolean) {
    const body = JSON.stringify({email, password});
    if (register) {
      await this.request('register', 'POST', body);
    }

    try {
      const {token, expiry} = jsonObject(await this.request('login', 'POST', body));
      if (
        typeof token !== 'string' ||
        !token ||
        typeof expiry !== 'string'
      ) {
        throw new Error(unexpectedResponse);
      }
      const storedExpiry = Date.parse(expiry) / 1000 - swiftDateEpoch;
      if (sessionExpired(storedExpiry)) {
        throw new Error(unexpectedResponse);
      }
      const profile = await this.fetchProfile(token);
      const session: Session = {profile, token, expiry: storedExpiry};
      await this.platform.writeAccountSession(JSON.stringify(session));
      return profile;
    } catch (error) {
      if (
        register &&
        isUnavailable(error)
      ) {
        throw new Error('Your account was created. Choose Sign in to continue.');
      }
      throw error;
    }
  }

  async signOut() {
    const session = await this.readSession();
    if (session) {
      try {
        await this.request('logout', 'POST', null, session.token);
      } catch (error) {
        if (!isUnauthorized(error)) {
          throw error;
        }
      }
    }
    await this.platform.writeAccountSession(null);
  }

  private async readSession(): Promise<Session | null> {
    const stored = await this.platform.readAccountSession();
    if (stored === null) {
      return null;
    }
    const {profile, token, expiry} = jsonObject(stored);
    const account = readProfile(profile);
    if (
      !account ||
      typeof token !== 'string' ||
      !token ||
      typeof expiry !== 'number' ||
      sessionExpired(expiry)
    ) {
      await this.platform.writeAccountSession(null);
      return null;
    }
    return {profile: account, token, expiry};
  }

  private async fetchProfile(token: string): Promise<AccountProfile> {
    const profile = readProfile(jsonObject(await this.request('me', 'GET', null, token)));
    if (!profile) {
      throw new Error(unexpectedResponse);
    }
    return profile;
  }

  private async request(
    endpoint: Endpoint,
    method: 'GET' | 'POST',
    body: string | null = null,
    token: string | null = null,
  ): Promise<string> {
    const result = await this.platform.sendAccountRequest(
      `api/v1/auth/${endpoint}/`,
      method,
      body,
      token,
    );
    if (
      result.status < 200 ||
      result.status >= 300
    ) {
      throw new AccountHTTPError(result.status, result.body);
    }
    return result.body;
  }
}
