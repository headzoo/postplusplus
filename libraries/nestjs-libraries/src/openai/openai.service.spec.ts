const mockImagesGenerate = jest.fn();
const mockImagesEdit = jest.fn();
const mockToFile = jest.fn(
  async (_buffer: Buffer, name: string, options: { type: string }) => ({
    name,
    type: options.type,
  })
);

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    images: {
      generate: mockImagesGenerate,
      edit: mockImagesEdit,
    },
  })),
}));
jest.mock('openai/uploads', () => ({ toFile: mockToFile }));

import { OpenaiService } from './openai.service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2wQAAAABJRU5ErkJggg==',
  'base64'
);
const GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
const IMAGE_RESULT = { data: [{ b64_json: 'aW1hZ2U=' }] };

describe('OpenaiService.generateImage', () => {
  const service = new OpenaiService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockImagesGenerate.mockResolvedValue(IMAGE_RESULT);
    mockImagesEdit.mockResolvedValue(IMAGE_RESULT);
  });

  it('uses images.generate without references', async () => {
    await expect(service.generateImage('A cat')).resolves.toBe('aW1hZ2U=');

    expect(mockImagesGenerate).toHaveBeenCalledWith({
      prompt: 'A cat',
      model: 'chatgpt-image-latest',
      size: '1024x1024',
    });
    expect(mockImagesEdit).not.toHaveBeenCalled();
  });

  it('uses images.edit with every validated reference in order', async () => {
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': String(PNG.length) }),
      body: new Response(PNG).body,
    }));

    await expect(
      service.generateImage('A cat', false, [
        'https://cdn.example.com/first.png',
        'https://cdn.example.com/second.png',
      ])
    ).resolves.toBe('aW1hZ2U=');

    expect(mockToFile).toHaveBeenNthCalledWith(1, PNG, 'reference-0.png', {
      type: 'image/png',
    });
    expect(mockToFile).toHaveBeenNthCalledWith(2, PNG, 'reference-1.png', {
      type: 'image/png',
    });
    expect(mockImagesEdit).toHaveBeenCalledWith({
      image: [
        { name: 'reference-0.png', type: 'image/png' },
        { name: 'reference-1.png', type: 'image/png' },
      ],
      prompt: 'A cat',
      model: 'chatgpt-image-latest',
      size: '1024x1024',
    });
    expect(mockImagesGenerate).not.toHaveBeenCalled();
  });

  it('converts GIF references to PNG before images.edit', async () => {
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      headers: new Headers({ 'content-length': String(GIF.length) }),
      body: new Response(GIF).body,
    }));

    await expect(
      service.generateImage('A cat', false, ['https://cdn.example.com/ref.gif'])
    ).resolves.toBe('aW1hZ2U=');

    expect(mockToFile).toHaveBeenCalledTimes(1);
    const [uploadBuffer, uploadName, uploadOptions] = mockToFile.mock.calls[0];
    expect(uploadName).toBe('reference-0.png');
    expect(uploadOptions).toEqual({ type: 'image/png' });
    expect(uploadBuffer.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(mockImagesEdit).toHaveBeenCalledWith({
      image: [{ name: 'reference-0.png', type: 'image/png' }],
      prompt: 'A cat',
      model: 'chatgpt-image-latest',
      size: '1024x1024',
    });
    expect(mockImagesGenerate).not.toHaveBeenCalled();
  });

  it('rejects an invalid reference instead of falling back to generation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      body: new Response(Buffer.from('not an image')).body,
    });

    await expect(
      service.generateImage('A cat', false, ['https://cdn.example.com/invalid'])
    ).rejects.toThrow('Unsupported reference image type');

    expect(mockImagesEdit).not.toHaveBeenCalled();
    expect(mockImagesGenerate).not.toHaveBeenCalled();
  });

  it('rejects invalid base64 responses from either API branch', async () => {
    mockImagesGenerate.mockResolvedValue({ data: [{ b64_json: 'invalid' }] });

    await expect(service.generateImage('A cat')).rejects.toThrow(
      'Invalid image generation response'
    );
  });
});
