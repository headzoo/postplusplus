'use client';

import { FC } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

export const PicksSocialsComponent: FC<{
  toolTip?: boolean;
  disabled?: boolean;
  quoteReferenceActive?: boolean;
}> = ({ toolTip, disabled = false, quoteReferenceActive = false }) => {
  const exising = useExistingData();

  const {
    locked,
    addOrRemoveSelectedIntegration,
    integrations,
    selectedIntegrations,
    postReference,
  } = useLaunchStore(
    useShallow((state) => ({
      integrations: state.integrations,
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      locked: state.locked,
      postReference: state.postReference,
    }))
  );

  const referenceProvider =
    quoteReferenceActive && postReference
      ? postReference.providerIdentifier
      : undefined;

  return (
    <div
      className={clsx(
        'flex',
        (locked || disabled) && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex flex-1">
        <div className="innerComponent flex-1 flex">
          <div className="flex flex-wrap gap-[12px] flex-1">
            {integrations
              .filter((f) => {
                if (exising.integration) {
                  return f.id === exising.integration;
                }
                return !f.inBetweenSteps && !f.disabled;
              })
              .map((integration) => {
                const mismatchedReference =
                  !!referenceProvider &&
                  integration.identifier !== referenceProvider;

                return (
                  <div
                    key={integration.id}
                    className={clsx(
                      'flex gap-[8px] items-center',
                      mismatchedReference && 'opacity-30 pointer-events-none'
                    )}
                    {...(toolTip && {
                      'data-tooltip-id': 'tooltip',
                      'data-tooltip-content': integration.name,
                    })}
                  >
                    <div
                      onClick={() => {
                        if (exising.integration || mismatchedReference) {
                          return;
                        }
                        addOrRemoveSelectedIntegration(integration, {});
                      }}
                      className={clsx(
                        'cursor-pointer border-[2px] relative rounded-full flex justify-center items-center bg-fifth filter transition-all duration-500',
                        selectedIntegrations.findIndex(
                          (p) => p.integration.id === integration.id
                        ) === -1
                          ? 'grayscale border-transparent'
                          : 'border-[#622FF6]'
                      )}
                    >
                      <ImageWithFallback
                        fallbackSrc="/no-picture.jpg"
                        src={integration.picture || '/no-picture.jpg'}
                        className={clsx(
                          'rounded-full transition-all min-w-[42px] border-[1.5px] min-h-[42px]',
                          selectedIntegrations.findIndex(
                            (p) => p.integration.id === integration.id
                          ) === -1
                            ? 'border-transparent'
                            : 'border-[#000]'
                        )}
                        alt={integration.identifier}
                        width={42}
                        height={42}
                      />
                      {integration.identifier === 'youtube' ? (
                        <img
                          src="/icons/platforms/youtube.svg"
                          className="absolute z-10 bottom-0 -end-[5px] min-w-[16px]"
                          width={16}
                        />
                      ) : (
                        <SafeImage
                          src={`/icons/platforms/${integration.identifier}.png`}
                          className="rounded-[4px] absolute z-10 bottom-0 -end-[5px] min-w-[16px] min-h-[16px]"
                          alt={integration.identifier}
                          width={16}
                          height={16}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
