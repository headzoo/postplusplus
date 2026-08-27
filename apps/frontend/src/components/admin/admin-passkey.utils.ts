export const base64UrlToUint8Array = (value: string): Uint8Array => {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const bufferToBase64Url = (value: ArrayBuffer): string => {
  const binary = String.fromCharCode(...new Uint8Array(value));

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export const getSafeAdminReturnTo = (returnTo?: string | null): string => {
  if (
    !returnTo ||
    !returnTo.startsWith('/admin') ||
    returnTo.startsWith('//')
  ) {
    return '/admin';
  }

  const url = new URL(returnTo, 'https://postiz.local');
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    return '/admin';
  }
  const normalizedPathname = new URL(decodedPathname, 'https://postiz.local')
    .pathname;

  if (
    url.origin !== 'https://postiz.local' ||
    normalizedPathname !== url.pathname ||
    (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/'))
  ) {
    return '/admin';
  }

  return `${url.pathname}${url.search}`;
};

type RegistrationOptionsJson = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'excludeCredentials' | 'user'
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string };
  excludeCredentials?: Array<
    Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }
  >;
};

type AssertionOptionsJson = Omit<
  PublicKeyCredentialRequestOptions,
  'allowCredentials' | 'challenge'
> & {
  challenge: string;
  allowCredentials?: Array<
    Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }
  >;
};

export const registrationOptionsToCredentialOptions = (
  options: RegistrationOptionsJson
): CredentialCreationOptions => ({
  publicKey: {
    ...options,
    challenge: base64UrlToUint8Array(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToUint8Array(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToUint8Array(credential.id),
    })),
  },
});

export const assertionOptionsToCredentialOptions = (
  options: AssertionOptionsJson
): CredentialRequestOptions => ({
  publicKey: {
    ...options,
    challenge: base64UrlToUint8Array(options.challenge),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToUint8Array(credential.id),
    })),
  },
});

const serializeCredential = (credential: PublicKeyCredential) => ({
  id: credential.id,
  rawId: bufferToBase64Url(credential.rawId),
  type: credential.type,
  authenticatorAttachment: credential.authenticatorAttachment || undefined,
  clientExtensionResults: credential.getClientExtensionResults(),
});

export const serializeRegistrationCredential = (
  credential: PublicKeyCredential
) => {
  const response = credential.response as AuthenticatorAttestationResponse & {
    getAuthenticatorData?: () => ArrayBuffer;
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
  };

  return {
    ...serializeCredential(credential),
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      authenticatorData: response.getAuthenticatorData
        ? bufferToBase64Url(response.getAuthenticatorData())
        : undefined,
      transports: response.getTransports?.(),
      publicKeyAlgorithm: response.getPublicKeyAlgorithm?.(),
      publicKey: response.getPublicKey?.()
        ? bufferToBase64Url(response.getPublicKey()!)
        : undefined,
    },
  };
};

export const serializeAssertionCredential = (
  credential: PublicKeyCredential
) => {
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    ...serializeCredential(credential),
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64Url(response.userHandle)
        : undefined,
    },
  };
};
