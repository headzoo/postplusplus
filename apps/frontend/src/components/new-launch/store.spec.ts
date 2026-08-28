import { useLaunchStore } from './store';
import { PostReferenceState } from './post-reference.types';

const xIntegration = {
  id: 'x-channel',
  name: 'X Account',
  identifier: 'x',
  inBetweenSteps: false,
  editor: 'normal' as const,
  display: 'x',
  type: 'social',
  picture: '/picture.png',
  changeProfilePicture: false,
  additionalSettings: '',
  changeNickName: false,
  time: [],
};

const linkedinIntegration = {
  ...xIntegration,
  id: 'linkedin-channel',
  name: 'LinkedIn',
  identifier: 'linkedin',
};

const quoteReference: PostReferenceState = {
  type: 'quote',
  providerIdentifier: 'x',
  externalId: '1234567890',
  url: 'https://x.com/user/status/1234567890',
  preview: {
    authorName: 'Jane Doe',
    authorUsername: 'jane',
    content: 'Quoted status text',
  },
};

describe('useLaunchStore post reference', () => {
  beforeEach(() => {
    useLaunchStore.getState().reset();
    useLaunchStore
      .getState()
      .setAllIntegrations([xIntegration, linkedinIntegration]);
  });

  it('stores and clears a quote reference', () => {
    useLaunchStore.getState().setPostReference(quoteReference);
    expect(useLaunchStore.getState().postReference).toEqual(quoteReference);

    useLaunchStore.getState().clearPostReference();
    expect(useLaunchStore.getState().postReference).toBeNull();
  });

  it('clears quote reference on reset and resetForNextPost', () => {
    useLaunchStore.getState().setPostReference(quoteReference);

    useLaunchStore.getState().reset();
    expect(useLaunchStore.getState().postReference).toBeNull();

    useLaunchStore.getState().setPostReference(quoteReference);
    useLaunchStore.getState().resetForNextPost();
    expect(useLaunchStore.getState().postReference).toBeNull();
  });

  it('blocks provider-mismatched channel selection while a quote reference exists', () => {
    useLaunchStore.getState().setPostReference(quoteReference);
    useLaunchStore.getState().addOrRemoveSelectedIntegration(xIntegration, {});

    expect(useLaunchStore.getState().selectedIntegrations).toHaveLength(1);

    useLaunchStore
      .getState()
      .addOrRemoveSelectedIntegration(linkedinIntegration, {});

    expect(useLaunchStore.getState().selectedIntegrations).toHaveLength(1);
    expect(
      useLaunchStore.getState().selectedIntegrations[0].integration.id
    ).toBe('x-channel');
  });

  it('blocks removing the selected channel while a quote reference exists', () => {
    useLaunchStore.getState().setPostReference(quoteReference);
    useLaunchStore.getState().addOrRemoveSelectedIntegration(xIntegration, {});

    useLaunchStore.getState().addOrRemoveSelectedIntegration(xIntegration, {});

    expect(useLaunchStore.getState().selectedIntegrations).toHaveLength(1);
  });

  it('blocks adding a second matching channel while a quote reference exists', () => {
    const secondX = { ...xIntegration, id: 'x-channel-2', name: 'X Two' };
    useLaunchStore
      .getState()
      .setAllIntegrations([xIntegration, secondX, linkedinIntegration]);
    useLaunchStore.getState().setPostReference(quoteReference);
    useLaunchStore.getState().addOrRemoveSelectedIntegration(xIntegration, {});

    useLaunchStore.getState().addOrRemoveSelectedIntegration(secondX, {});

    expect(useLaunchStore.getState().selectedIntegrations).toHaveLength(1);
  });
});
