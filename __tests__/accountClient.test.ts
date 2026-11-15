import {
  AccountClient,
} from '../src/accountClient';

const profile = {
  id: '9e731932-000e-4d17-bd8a-16e2b0983020',
  email: 'sample@example.com',
};
const token = 'sample-token';
const legacyExpiry = Date.now() / 1000 - 978307200 + 3600;

function mockPlatform() {
  return {
    readAccountSession: jest.fn<Promise<string | null>, []>().mockResolvedValue(null),
    writeAccountSession: jest.fn().mockResolvedValue(undefined),
    sendAccountRequest: jest.fn(),
  };
}

test('restores a Swift Keychain session when the server is offline', async () => {
  const platform = mockPlatform();
  platform.readAccountSession.mockResolvedValue(JSON.stringify({
    profile: {
      ...profile,
      id: profile.id.toUpperCase(),
    },
    token,
    expiry: legacyExpiry,
  }));
  platform.sendAccountRequest.mockRejectedValue({code: 'account-network'});

  await expect(new AccountClient(platform).status()).resolves.toEqual(profile);
  expect(platform.sendAccountRequest).toHaveBeenCalledWith('api/v1/auth/me/', 'GET', null, token);
  expect(platform.writeAccountSession).not.toHaveBeenCalled();
});

test('clears expired and revoked sessions', async () => {
  const platform = mockPlatform();
  const client = new AccountClient(platform);
  platform.readAccountSession.mockResolvedValue(JSON.stringify({profile, token, expiry: 1}));

  await expect(client.status()).resolves.toBeNull();
  expect(platform.sendAccountRequest).not.toHaveBeenCalled();

  platform.readAccountSession.mockResolvedValue(JSON.stringify({profile, token, expiry: legacyExpiry}));
  platform.sendAccountRequest.mockResolvedValue({status: 401, body: ''});

  await expect(client.status()).resolves.toBeNull();
  expect(platform.writeAccountSession.mock.calls).toEqual([[null], [null]]);
});

test('writes a compatible Keychain session after registration and revokes it on sign-out', async () => {
  const platform = mockPlatform();
  const client = new AccountClient(platform);
  const expiry = new Date(Date.now() + 3600 * 1000);
  platform.sendAccountRequest
    .mockResolvedValueOnce({status: 201, body: JSON.stringify(profile)})
    .mockResolvedValueOnce({status: 200, body: JSON.stringify({token, expiry: expiry.toISOString()})})
    .mockResolvedValueOnce({status: 200, body: JSON.stringify(profile)})
    .mockResolvedValueOnce({status: 204, body: ''});

  await expect(client.authenticate(profile.email, 'sample-password', true)).resolves.toEqual(profile);
  const stored = platform.writeAccountSession.mock.calls[0][0];
  expect(JSON.parse(stored)).toEqual({profile, token, expiry: expiry.getTime() / 1000 - 978307200});
  expect(stored).not.toContain('sample-password');

  platform.readAccountSession.mockResolvedValue(stored);
  await client.signOut();
  expect(platform.sendAccountRequest).toHaveBeenLastCalledWith('api/v1/auth/logout/', 'POST', null, token);
  expect(platform.writeAccountSession).toHaveBeenLastCalledWith(null);
});
