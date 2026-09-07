import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export const CHANNEL_LEAD_DISCOVERY_DEFAULT_DAILY_QUOTA = 5;
export const CHANNEL_LEAD_DISCOVERY_MAX_DAILY_QUOTA = 25;

export class UpdateChannelLeadDiscoveryDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(CHANNEL_LEAD_DISCOVERY_MAX_DAILY_QUOTA)
  dailyQuota!: number;
}
