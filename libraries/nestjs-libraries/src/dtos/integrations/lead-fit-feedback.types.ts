export const LEAD_FIT_FEEDBACK_SOURCES = ['lead_dismiss', 'list_add'] as const;
export type LeadFitFeedbackSource = (typeof LEAD_FIT_FEEDBACK_SOURCES)[number];

export const LEAD_FIT_FEEDBACK_VERDICTS = ['rejected', 'accepted'] as const;
export type LeadFitFeedbackVerdict =
  (typeof LEAD_FIT_FEEDBACK_VERDICTS)[number];

export const LEAD_FIT_DISMISS_REASONS = [
  'wrong_topic',
  'bio_wording',
  'promotional',
  'competitor',
  'not_a_prospect',
] as const;
export type LeadFitDismissReason = (typeof LEAD_FIT_DISMISS_REASONS)[number];

export const LEAD_FIT_DISMISS_REASON_LABELS: Record<
  LeadFitDismissReason,
  { key: string; defaultLabel: string }
> = {
  wrong_topic: {
    key: 'followers_lead_dismiss_wrong_topic',
    defaultLabel: "Not this channel's audience",
  },
  bio_wording: {
    key: 'followers_lead_dismiss_bio_wording',
    defaultLabel: 'Words or claims in the bio',
  },
  promotional: {
    key: 'followers_lead_dismiss_promotional',
    defaultLabel: 'Selling, spam, or engagement-bait',
  },
  competitor: {
    key: 'followers_lead_dismiss_competitor',
    defaultLabel: 'Competitor or similar product',
  },
  not_a_prospect: {
    key: 'followers_lead_dismiss_not_a_prospect',
    defaultLabel: 'Not a potential customer',
  },
};

export function isLeadFitDismissReason(
  value: string
): value is LeadFitDismissReason {
  return (LEAD_FIT_DISMISS_REASONS as readonly string[]).includes(value);
}
