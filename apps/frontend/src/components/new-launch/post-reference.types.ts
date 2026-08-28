export interface PostReferencePreview {
  authorName?: string;
  authorUsername?: string;
  authorPicture?: string;
  content?: string;
  publishedAt?: string;
  media?: { url: string; type?: 'image' | 'video' }[];
}

export interface PostReferenceState {
  type: 'quote';
  providerIdentifier: string;
  externalId: string;
  url?: string;
  preview?: PostReferencePreview;
}

export type PostReferencePublish = Omit<PostReferenceState, 'preview'>;

export function serializePostReferenceForPublish(
  reference: PostReferenceState
): PostReferencePublish {
  return {
    type: reference.type,
    providerIdentifier: reference.providerIdentifier,
    externalId: reference.externalId,
    ...(reference.url ? { url: reference.url } : {}),
  };
}

export function postReferenceSnapshotKey(
  reference: PostReferenceState | null | undefined
): string | null {
  if (!reference) {
    return null;
  }

  return JSON.stringify(serializePostReferenceForPublish(reference));
}

export function attachRootPostReference<
  T extends { value: Array<Record<string, unknown>> }
>(post: T, reference: PostReferenceState | null): T {
  if (!reference) {
    return post;
  }

  return {
    ...post,
    value: post.value.map((value, index) =>
      index === 0
        ? { ...value, reference: serializePostReferenceForPublish(reference) }
        : value
    ),
  };
}
