import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { LEAD_FIT_VERSION } from '@gitroom/nestjs-libraries/temporal/lead-bridge.schedule';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

const truncateString = (max: number) =>
  z.string().transform((value) => value.trim().slice(0, max));

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const TriageRerankResponse = z.object({
  candidates: z.array(
    z.object({
      externalId: z.string().min(1).max(512),
      reason: truncateString(280).pipe(z.string().min(1)),
      suggestedAction: truncateString(280).pipe(z.string().min(1)),
    })
  ),
});

export type TriageRerankInput = {
  triage: 'hot' | 'cultivate';
  strategy: {
    id: string;
    version: number;
    summary: string;
    directives: readonly string[];
  };
  channelDocuments: Array<{ name: string; content: string }>;
  expertise: Array<{ name: string; content: string }>;
  candidates: Array<{
    externalId: string;
    name?: string;
    username?: string;
    bio?: string;
    rulesReason: string;
  }>;
};

@Injectable()
export class OpenaiService {
  async generateImage(prompt: string, isVertical = false) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3.
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'chatgpt-image-latest',
        size: isVertical ? '1024x1536' : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
            content
              ?.slice(start + 1, end)
              .replace(/\n/g, ' ')
              .replace(/ {2,}/g, ' ') +
            ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${len - 10
                } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-4.1',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await openai.chat.completions.parse({
              model: 'gpt-4.1',
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }

  async generateAltText(imageUrl: string) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content:
            'You generate concise accessibility alt text for social media images. Describe the image in one sentence, maximum 125 characters. Do not use quotes, markdown, or prefixes like "Alt text:". Return only the alt text.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Generate alt text for this image.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 80,
    });

    const alt = response.choices[0]?.message?.content?.trim() || '';
    const cleaned = alt.replace(/^["']|["']$/g, '').trim();
    if (!cleaned) {
      throw new Error('Empty alt text');
    }

    return cleaned.slice(0, 125);
  }

  async rerankTriageCandidates(input: TriageRerankInput) {
    const parsed = (
      await openai.chat.completions.parse({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You prioritize a bounded list of ${input.triage} relationship triage candidates.
Use only supplied channel context, strategy directives, expertise playbooks, profile details, and rules reasons.
Return an ordered subset of candidate IDs. Do not add IDs, scores, scoring thresholds, or configuration.
Each reason must be concise and grounded in provided evidence. A suggestedAction is only a recommendation; never claim an action was performed.
Do not infer private traits. Omit candidates when deferral or no engagement is appropriate.`,
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        response_format: zodResponseFormat(
          TriageRerankResponse,
          'triageRerank'
        ),
      })
    ).choices[0].message.parsed;
    if (!parsed) {
      throw new Error('Empty triage rerank');
    }
    return parsed.candidates;
  }

  async scoreLeadFit(input: {
    channelDocuments: Array<{ name: string; content: string }>;
    strategy?: {
      id: string;
      version: number;
      summary: string;
      directives: readonly string[];
    };
    expertise?: Array<{ name: string; content: string }>;
    candidate: {
      name?: string;
      username?: string;
      bio?: string;
      followersCount?: number;
      followingCount?: number;
    };
    bridges?: Array<{ username?: string; grade?: number }>;
    rejectedExamples?: Array<{
      name?: string;
      username?: string;
      bio?: string;
      reasons?: string[];
    }>;
    acceptedExamples?: Array<{
      name?: string;
      username?: string;
      bio?: string;
      reasons?: string[];
    }>;
  }) {
    const LeadFitScore = z.object({
      score: z.number().min(0).max(100),
      reason: truncateString(280),
      concerns: z.array(truncateString(120)).max(5),
      matchedTopics: z.array(truncateString(80)).max(8),
    });

    const documents =
      input.channelDocuments.length > 0
        ? input.channelDocuments
          .map(
            (document) =>
              `### ${document.name}\n${document.content.slice(0, 6000)}`
          )
          .join('\n\n')
        : '(No channel context documents attached.)';

    const parsed = (
      await openai.chat.completions.parse({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You score how well a social profile fits a channel's intended audience.
Use only the strategy context, channel Markdown documents, expertise playbooks, candidate's public profile text, and human feedback examples.
Score 0-100 where 100 is an excellent fit.
Penalize clear conflicts with the channel's stated beliefs, politics, audience, or topics.
Reward explicit topical alignment (for example tech) when the channel seeks that audience.
When rejectedExamples are provided, treat them as labeled negatives: lower the score for candidates with similar bios, job titles, niches, or distinctive words/phrases.
Pay special attention when a rejected example includes reason "bio_wording"; extract concrete tokens or short phrases from those rejected bios and penalize candidates that reuse them. Name those phrases in concerns when they apply.
When acceptedExamples are provided, reward similarity to those accepted bios and topics.
Do not infer private traits. Prefer short, concrete reasons based on stated bio/profile text.
If channel documents are missing, score conservatively from general profile quality and return a low-confidence reason.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              channelDocuments: documents,
              strategy: input.strategy,
              expertise: input.expertise || [],
              candidate: input.candidate,
              discoveredVia: input.bridges || [],
              rejectedExamples: input.rejectedExamples || [],
              acceptedExamples: input.acceptedExamples || [],
            }),
          },
        ],
        response_format: zodResponseFormat(LeadFitScore, 'leadFitScore'),
      })
    ).choices[0].message.parsed;

    if (!parsed) {
      throw new Error('Empty lead fit score');
    }

    return {
      score: Math.round(parsed.score),
      reason: parsed.reason.trim().slice(0, 280),
      concerns: parsed.concerns.map((item) => item.trim()).filter(Boolean).slice(0, 5),
      matchedTopics: parsed.matchedTopics
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8),
      model: 'gpt-4.1',
      version: LEAD_FIT_VERSION,
    };
  }
}
