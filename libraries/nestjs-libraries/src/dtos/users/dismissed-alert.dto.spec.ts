import { validate } from 'class-validator';
import { DismissAlertDto } from './dismissed-alert.dto';

describe('DismissAlertDto', () => {
  it('accepts a valid alert key', async () => {
    const dto = Object.assign(new DismissAlertDto(), {
      alertKey: 'followers.triage.hot',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a missing alert key', async () => {
    const dto = Object.assign(new DismissAlertDto(), {});
    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'alertKey' }),
      ])
    );
  });

  it('rejects an oversized alert key', async () => {
    const dto = Object.assign(new DismissAlertDto(), {
      alertKey: 'a'.repeat(129),
    });
    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'alertKey' }),
      ])
    );
  });

  it('rejects alert keys with invalid characters', async () => {
    const dto = Object.assign(new DismissAlertDto(), {
      alertKey: 'Followers/Triage Hot',
    });
    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'alertKey' }),
      ])
    );
  });
});
