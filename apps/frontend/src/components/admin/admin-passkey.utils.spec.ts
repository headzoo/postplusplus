import {
  base64UrlToUint8Array,
  bufferToBase64Url,
  getSafeAdminReturnTo,
} from './admin-passkey.utils';

describe('admin passkey utilities', () => {
  it('round-trips binary WebAuthn fields as base64url', () => {
    const input = new Uint8Array([0, 255, 254, 1]).buffer;
    const encoded = bufferToBase64Url(input);

    expect(encoded).toBe('AP_-AQ');
    expect(Array.from(base64UrlToUint8Array(encoded))).toEqual([
      0, 255, 254, 1,
    ]);
  });

  it.each([
    ['/admin', '/admin'],
    ['/admin/users?tab=active', '/admin/users?tab=active'],
    ['/administrator', '/admin'],
    ['https://example.com/admin', '/admin'],
    ['//example.com/admin', '/admin'],
    ['/admin%2f..%2fcalendar', '/admin'],
    ['javascript:alert(1)', '/admin'],
  ])('only accepts internal admin return paths', (value, expected) => {
    expect(getSafeAdminReturnTo(value)).toBe(expected);
  });
});
