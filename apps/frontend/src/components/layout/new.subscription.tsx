import { useSearchParams } from 'next/navigation';
import { FC, useEffect } from 'react';
import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
export const NewSubscription: FC = () => {
  const query = useSearchParams();
  const check = query.get('check');
  const fireEvents = useFireEvents();
  useEffect(() => {
    if (check) {
      fireEvents('purchase');
    }
  }, [check, fireEvents]);
  return null;
};
