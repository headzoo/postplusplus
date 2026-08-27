import { validate } from 'class-validator';
import { UpdateChannelUtmParamsDto } from '@gitroom/nestjs-libraries/dtos/integrations/channel-utm-params.dto';

describe('UpdateChannelUtmParamsDto', () => {
  const validateDto = (utmParams: string) =>
    validate(Object.assign(new UpdateChannelUtmParamsDto(), { utmParams }));

  it('accepts valid query strings and empty clears', async () => {
    await expect(
      validateDto('utm_campaign=spring&utm_medium=social')
    ).resolves.toEqual([]);
    await expect(validateDto('?utm_campaign=spring')).resolves.toEqual([]);
    await expect(validateDto('')).resolves.toEqual([]);
  });

  it('rejects hash fragments and empty keys', async () => {
    const hashErrors = await validateDto('utm_campaign=a#frag');
    expect(hashErrors.length).toBeGreaterThan(0);

    const emptyKeyErrors = await validateDto('=value');
    expect(emptyKeyErrors.length).toBeGreaterThan(0);
  });
});
